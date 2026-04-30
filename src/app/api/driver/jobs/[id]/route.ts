import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { sendShippingUpdateToChat, sendDriverAssignedToChat } from "@/lib/chat-client";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

// GET /api/driver/jobs/[id] — Get job detail for driver
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const { data: job, error } = await supabase
      .from("delivery_jobs")
      .select("*, tracking_updates(*)")
      .eq("id", params.id)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404, headers });
    }

    // Sort tracking updates
    if (job.tracking_updates) {
      job.tracking_updates.sort(
        (a: { created_at: string }, b: { created_at: string }) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }

    return NextResponse.json({ job }, { headers });
  } catch (err) {
    console.error("Error fetching job:", err);
    return NextResponse.json({ error: "Failed to fetch job" }, { status: 500, headers });
  }
}

// POST /api/driver/jobs/[id] — Accept or decline a job
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const { action } = await request.json();
    if (!["accept", "decline"].includes(action)) {
      return NextResponse.json({ error: "Invalid action. Use 'accept' or 'decline'" }, { status: 400, headers });
    }

    // Find driver record
    const { data: driver } = await supabase
      .from("drivers")
      .select("id, name, phone, vehicle_type, active_job_id")
      .eq("user_id", auth.sub)
      .eq("is_active", true)
      .single();

    if (!driver) {
      return NextResponse.json({ error: "Driver not found" }, { status: 404, headers });
    }

    // Fetch the job
    const { data: job } = await supabase
      .from("delivery_jobs")
      .select("id, status, job_number, customer_id, merchant_id, merchant_name, delivery_address, metadata")
      .eq("id", params.id)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404, headers });
    }

    if (job.status !== "pending") {
      return NextResponse.json({ error: "Job is no longer available" }, { status: 400, headers });
    }

    if (action === "decline") {
      // Mark offer as declined if one exists
      await supabase
        .from("driver_job_offers")
        .update({ status: "declined", responded_at: new Date().toISOString() })
        .eq("job_id", params.id)
        .eq("driver_id", driver.id)
        .eq("status", "pending");

      return NextResponse.json({ message: "Job declined" }, { headers });
    }

    // === ACCEPT ===

    // Check driver doesn't already have an active job
    if (driver.active_job_id) {
      return NextResponse.json(
        { error: "You already have an active delivery. Complete it before accepting a new one." },
        { status: 400, headers }
      );
    }

    // Assign driver to job
    const { data: updated, error: assignError } = await supabase
      .from("delivery_jobs")
      .update({
        driver_id: driver.id,
        status: "assigned",
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .eq("status", "pending") // Optimistic lock: only if still pending
      .select()
      .single();

    if (assignError || !updated) {
      return NextResponse.json({ error: "Job already taken by another driver" }, { status: 409, headers });
    }

    // Update driver's active job
    await supabase
      .from("drivers")
      .update({
        active_job_id: params.id,
        is_available: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", driver.id);

    // Mark offer as accepted (if auto-dispatched)
    await supabase
      .from("driver_job_offers")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("job_id", params.id)
      .eq("driver_id", driver.id)
      .eq("status", "pending");

    // Create tracking update
    await supabase.from("tracking_updates").insert({
      job_id: params.id,
      status: "assigned",
      message: `Driver ${driver.name} has been assigned. Vehicle: ${driver.vehicle_type}.`,
      updated_by: auth.sub,
    });

    // Send chat notification — create driver↔buyer conversation
    const meta = (job.metadata as Record<string, string>) || {};
    const storeId = meta.store_id || job.merchant_id;
    const storeName = meta.store_name || job.merchant_name || "Store";

    // Fire-and-forget: create driver-buyer chat + notify
    sendDriverAssignedToChat({
      job_number: job.job_number,
      store_id: storeId,
      store_name: storeName,
      buyer_user_id: job.customer_id,
      seller_user_id: job.merchant_id,
      driver_user_id: auth.sub,
      driver_name: driver.name,
      driver_phone: driver.phone,
      driver_vehicle: driver.vehicle_type,
      delivery_address: job.delivery_address,
    }).catch(() => {});

    // Also notify seller↔buyer chat
    sendShippingUpdateToChat({
      job_number: job.job_number,
      store_id: storeId,
      store_name: storeName,
      buyer_user_id: job.customer_id,
      seller_user_id: job.merchant_id,
      new_status: "assigned",
      delivery_address: job.delivery_address,
      driver_name: driver.name,
    }).catch(() => {});

    return NextResponse.json({ message: "Job accepted", delivery: updated }, { headers });
  } catch (err) {
    console.error("Error processing job action:", err);
    return NextResponse.json({ error: "Failed to process action" }, { status: 500, headers });
  }
}

// PUT /api/driver/jobs/[id] — Update status of active delivery
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const body = await request.json();
    const { status: newStatus, proof_of_delivery_url } = body;

    const driverAllowedStatuses = ["picked_up", "in_transit", "delivered"];
    if (!driverAllowedStatuses.includes(newStatus)) {
      return NextResponse.json(
        { error: `Drivers can only set status to: ${driverAllowedStatuses.join(", ")}` },
        { status: 400, headers }
      );
    }

    // Find driver
    const { data: driver } = await supabase
      .from("drivers")
      .select("id, name")
      .eq("user_id", auth.sub)
      .eq("is_active", true)
      .single();

    if (!driver) {
      return NextResponse.json({ error: "Driver not found" }, { status: 404, headers });
    }

    // Fetch job and verify ownership
    const { data: job } = await supabase
      .from("delivery_jobs")
      .select("id, status, driver_id, job_number, customer_id, merchant_id, merchant_name, delivery_address, metadata, shipping_fee, platform_fee_pct")
      .eq("id", params.id)
      .eq("driver_id", driver.id)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job not found or not assigned to you" }, { status: 404, headers });
    }

    // Validate transition
    const validTransitions: Record<string, string[]> = {
      assigned: ["picked_up"],
      picked_up: ["in_transit"],
      in_transit: ["delivered"],
    };
    const allowed = validTransitions[job.status] || [];
    if (!allowed.includes(newStatus)) {
      return NextResponse.json(
        { error: `Cannot transition from "${job.status}" to "${newStatus}"` },
        { status: 400, headers }
      );
    }

    const updateData: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === "picked_up") {
      updateData.actual_pickup_time = new Date().toISOString();
    } else if (newStatus === "delivered") {
      updateData.actual_delivery_time = new Date().toISOString();
      if (proof_of_delivery_url) {
        updateData.proof_of_delivery_url = proof_of_delivery_url;
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from("delivery_jobs")
      .update(updateData)
      .eq("id", params.id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Create tracking update
    const statusMessages: Record<string, string> = {
      picked_up: "Package has been picked up from the merchant.",
      in_transit: "Your package is on its way!",
      delivered: "Package has been delivered.",
    };

    await supabase.from("tracking_updates").insert({
      job_id: params.id,
      status: newStatus,
      message: statusMessages[newStatus] || `Status updated to ${newStatus}`,
      updated_by: auth.sub,
    });

    // If delivered, auto-complete and handle payouts
    if (newStatus === "delivered") {
      // Auto-complete after delivery
      await supabase
        .from("delivery_jobs")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", params.id);

      await supabase.from("tracking_updates").insert({
        job_id: params.id,
        status: "completed",
        message: "Delivery completed successfully.",
        updated_by: auth.sub,
      });

      // Calculate and record earnings
      const shippingFee = parseFloat(String(job.shipping_fee)) || 0;
      const platformPct = parseFloat(String(job.platform_fee_pct)) || 20;
      const driverPayout = shippingFee * ((100 - platformPct) / 100);
      const platformFee = shippingFee - driverPayout;

      // Update job with fee breakdown
      await supabase
        .from("delivery_jobs")
        .update({ driver_payout: driverPayout, platform_fee: platformFee })
        .eq("id", params.id);

      // Record earning and trigger wallet payout
      if (driverPayout > 0) {
        const { data: payoutRecord } = await supabase.from("driver_payouts").insert({
          driver_id: driver.id,
          job_id: params.id,
          amount: driverPayout,
          type: "earning",
          status: "pending",
          description: `Delivery ${job.job_number}`,
        }).select().single();

        // Auto-transfer to driver's Peeap wallet (fire-and-forget)
        const MAIN_API = process.env.MAIN_API_URL || "https://api.peeap.com";
        fetch(`${MAIN_API}/api/wallets/credit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Service-Secret": process.env.SERVICE_SECRET || "",
          },
          body: JSON.stringify({
            user_id: auth.sub,
            amount: driverPayout,
            description: `Delivery payout - ${job.job_number}`,
            reference: `shipping_payout_${payoutRecord?.id || params.id}`,
            source: "shipping",
          }),
        }).then(async (res) => {
          if (res.ok && payoutRecord) {
            await supabase.from("driver_payouts")
              .update({ status: "completed" })
              .eq("id", payoutRecord.id);
          }
        }).catch((err) => {
          console.error("Wallet payout failed:", err);
        });
      }

      // Update driver stats
      const { data: driverStats } = await supabase
        .from("drivers")
        .select("total_deliveries, total_earnings")
        .eq("id", driver.id)
        .single();

      if (driverStats) {
        await supabase
          .from("drivers")
          .update({
            total_deliveries: (driverStats.total_deliveries || 0) + 1,
            total_earnings: (parseFloat(String(driverStats.total_earnings)) || 0) + driverPayout,
            active_job_id: null,
            is_available: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", driver.id);
      }
    }

    // Send chat notifications (fire-and-forget)
    const meta = (job.metadata as Record<string, string>) || {};
    const storeId = meta.store_id || job.merchant_id;
    const storeName = meta.store_name || job.merchant_name || "Store";

    sendShippingUpdateToChat({
      job_number: job.job_number,
      store_id: storeId,
      store_name: storeName,
      buyer_user_id: job.customer_id,
      seller_user_id: job.merchant_id,
      new_status: newStatus,
      delivery_address: job.delivery_address,
      driver_name: driver.name,
    }).catch(() => {});

    return NextResponse.json({ delivery: updated }, { headers });
  } catch (err) {
    console.error("Error updating job status:", err);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500, headers });
  }
}
