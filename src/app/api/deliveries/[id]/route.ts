import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { updateDeliveryStatusSchema } from "@/lib/validation";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

// GET /api/deliveries/[id] — Get delivery detail with tracking timeline
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers }
    );
  }

  try {
    const { data: delivery, error } = await supabase
      .from("delivery_jobs")
      .select("*, driver:drivers(*), tracking_updates(*)")
      .eq("id", params.id)
      .single();

    if (error || !delivery) {
      return NextResponse.json(
        { error: "Delivery not found" },
        { status: 404, headers }
      );
    }

    // Verify access: must be merchant, customer, or assigned driver
    const isOwner =
      delivery.merchant_id === auth.sub ||
      delivery.customer_id === auth.sub;

    if (!isOwner) {
      // Check if user is the assigned driver
      if (delivery.driver_id) {
        const { data: driverRecord } = await supabase
          .from("drivers")
          .select("id")
          .eq("id", delivery.driver_id)
          .eq("user_id", auth.sub)
          .single();

        if (!driverRecord) {
          return NextResponse.json(
            { error: "Unauthorized" },
            { status: 403, headers }
          );
        }
      } else {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 403, headers }
        );
      }
    }

    // Sort tracking updates by created_at
    if (delivery.tracking_updates) {
      delivery.tracking_updates.sort(
        (a: { created_at: string }, b: { created_at: string }) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }

    return NextResponse.json({ delivery }, { headers });
  } catch (err) {
    console.error("Error fetching delivery:", err);
    return NextResponse.json(
      { error: "Failed to fetch delivery" },
      { status: 500, headers }
    );
  }
}

// PUT /api/deliveries/[id] — Update delivery status
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers }
    );
  }

  try {
    const body = await request.json();
    const parsed = updateDeliveryStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400, headers }
      );
    }

    // Fetch existing delivery
    const { data: existing, error: fetchError } = await supabase
      .from("delivery_jobs")
      .select("id, merchant_id, customer_id, driver_id, status")
      .eq("id", params.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Delivery not found" },
        { status: 404, headers }
      );
    }

    // Verify access
    let isDriver = false;
    if (existing.driver_id) {
      const { data: driverRecord } = await supabase
        .from("drivers")
        .select("id")
        .eq("id", existing.driver_id)
        .eq("user_id", auth.sub)
        .single();
      isDriver = !!driverRecord;
    }

    const isMerchant = existing.merchant_id === auth.sub;

    if (!isMerchant && !isDriver) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403, headers }
      );
    }

    // Validate status transition
    const validTransitions: Record<string, string[]> = {
      pending: ["assigned", "cancelled"],
      assigned: ["picked_up", "cancelled"],
      picked_up: ["in_transit", "cancelled", "failed"],
      in_transit: ["delivered", "failed"],
      delivered: ["completed"],
      completed: [],
      cancelled: [],
      failed: [],
    };

    const allowed = validTransitions[existing.status] || [];
    if (!allowed.includes(parsed.data.status)) {
      return NextResponse.json(
        {
          error: `Cannot transition from "${existing.status}" to "${parsed.data.status}"`,
        },
        { status: 400, headers }
      );
    }

    const updateData: Record<string, unknown> = {
      status: parsed.data.status,
      updated_at: new Date().toISOString(),
    };

    // Set timestamps based on status
    if (parsed.data.status === "picked_up") {
      updateData.actual_pickup_time = new Date().toISOString();
    } else if (
      parsed.data.status === "delivered" ||
      parsed.data.status === "completed"
    ) {
      updateData.actual_delivery_time = new Date().toISOString();
    }

    if (parsed.data.cancel_reason) {
      updateData.cancel_reason = parsed.data.cancel_reason;
    }
    if (parsed.data.failure_reason) {
      updateData.failure_reason = parsed.data.failure_reason;
    }
    if (parsed.data.proof_of_delivery_url) {
      updateData.proof_of_delivery_url = parsed.data.proof_of_delivery_url;
    }

    const { data: updated, error: updateError } = await supabase
      .from("delivery_jobs")
      .update(updateData)
      .eq("id", params.id)
      .select("*, driver:drivers(*)")
      .single();

    if (updateError) throw updateError;

    // Create tracking update
    const statusMessages: Record<string, string> = {
      assigned: "Driver has been assigned to your delivery.",
      picked_up: "Package has been picked up from the merchant.",
      in_transit: "Your package is on its way!",
      delivered: "Package has been delivered.",
      completed: "Delivery completed successfully.",
      cancelled: `Delivery cancelled. ${parsed.data.cancel_reason || ""}`.trim(),
      failed: `Delivery failed. ${parsed.data.failure_reason || ""}`.trim(),
    };

    await supabase.from("tracking_updates").insert({
      job_id: params.id,
      status: parsed.data.status,
      message: statusMessages[parsed.data.status] || `Status updated to ${parsed.data.status}`,
      updated_by: auth.sub,
    });

    // If completed, update driver stats
    if (parsed.data.status === "completed" && updated.driver_id) {
      const { data: driver } = await supabase
        .from("drivers")
        .select("total_deliveries, total_earnings")
        .eq("id", updated.driver_id)
        .single();

      if (driver) {
        await supabase
          .from("drivers")
          .update({
            total_deliveries: (driver.total_deliveries || 0) + 1,
            total_earnings:
              (parseFloat(String(driver.total_earnings)) || 0) +
              (parseFloat(String(updated.driver_payout)) || 0),
            updated_at: new Date().toISOString(),
          })
          .eq("id", updated.driver_id);
      }
    }

    return NextResponse.json({ delivery: updated }, { headers });
  } catch (err) {
    console.error("Error updating delivery:", err);
    return NextResponse.json(
      { error: "Failed to update delivery" },
      { status: 500, headers }
    );
  }
}
