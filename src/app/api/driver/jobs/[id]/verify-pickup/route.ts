import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { sendShippingUpdateToChat } from "@/lib/chat-client";
import { notifyStatusChange } from "@/lib/status-webhook";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

/**
 * POST /api/driver/jobs/[id]/verify-pickup
 * Rider enters the 4-digit code that the vendor gives them.
 * This confirms the physical handoff from vendor → rider.
 *
 * Flow: assigned → (rider enters vendor code) → picked_up + in_transit
 * Messages: vendor (dispatched ✓), rider (received ✓), buyer (package picked up)
 */
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
    const { code } = await request.json();
    if (!code || typeof code !== "string" || (code.length !== 4 && code.length !== 6)) {
      return NextResponse.json({ error: "A 6-digit pickup code is required" }, { status: 400, headers });
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

    // Fetch job — must be assigned to this driver and in "assigned" status
    const { data: job } = await supabase
      .from("delivery_jobs")
      .select("id, status, driver_id, pickup_code, job_number, store_order_id, customer_id, customer_name, merchant_id, merchant_name, delivery_address, estimated_delivery_date, metadata")
      .eq("id", params.id)
      .eq("driver_id", driver.id)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job not found or not assigned to you" }, { status: 404, headers });
    }

    if (job.status !== "assigned") {
      return NextResponse.json({ error: "Job must be in 'assigned' status for pickup verification" }, { status: 400, headers });
    }

    // Verify the code
    if (code !== job.pickup_code) {
      return NextResponse.json({ error: "Invalid pickup code. Ask the vendor for the correct code." }, { status: 400, headers });
    }

    // Code verified — transition: assigned → picked_up → in_transit
    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("delivery_jobs")
      .update({
        status: "in_transit",
        actual_pickup_time: now,
        pickup_verified_at: now,
        updated_at: now,
      })
      .eq("id", params.id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Create tracking updates
    await supabase.from("tracking_updates").insert([
      {
        job_id: params.id,
        status: "picked_up",
        message: `Pickup verified (code: ${code}). Package received from vendor.`,
        updated_by: auth.sub,
      },
      {
        job_id: params.id,
        status: "in_transit",
        message: "Package is on its way to the delivery address.",
        updated_by: auth.sub,
      },
    ]);

    // ── Send 3-party notifications ──
    const meta = (job.metadata as Record<string, string>) || {};
    const storeId = meta.store_id || job.merchant_id;
    const storeName = meta.store_name || job.merchant_name || "Store";
    const CHAT_API = process.env.CHAT_API_URL || "https://chat.peeap.com";
    const SERVICE_SECRET = process.env.SERVICE_SECRET || "";

    // 1. Vendor: "Goods dispatched to rider. Code verified ✓"
    await fetch(`${CHAT_API}/api/ecommerce/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Service-Secret": SERVICE_SECRET },
      body: JSON.stringify({
        order_id: job.job_number,
        store_id: storeId,
        buyer_user_id: job.merchant_id,
        seller_user_id: job.merchant_id,
        category: "shipping_update",
        content: `✅ Pickup code verified! Your package for order ${job.job_number} has been dispatched to rider ${driver.name}.`,
        rich_content: { job_number: job.job_number, new_status: "pickup_verified", driver_name: driver.name },
        tracking_number: job.job_number,
      }),
    }).catch(() => {});

    // 2. Buyer: "Your package has been picked up! On its way."
    const estimatedDate = job.estimated_delivery_date
      ? new Date(job.estimated_delivery_date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
      : "soon";

    sendShippingUpdateToChat({
      job_number: job.job_number,
      store_id: storeId,
      store_name: storeName,
      buyer_user_id: job.customer_id,
      seller_user_id: job.merchant_id,
      new_status: "picked_up",
      delivery_address: job.delivery_address,
      driver_name: driver.name,
    }).catch(() => {});

    // Extra buyer message with delivery date reminder
    await fetch(`${CHAT_API}/api/ecommerce/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Service-Secret": SERVICE_SECRET },
      body: JSON.stringify({
        order_id: job.job_number,
        store_id: storeId,
        buyer_user_id: job.customer_id,
        seller_user_id: job.merchant_id,
        category: "shipping_update",
        content: `🚚 Your package from ${storeName} has been picked up by ${driver.name} and is on its way!\n\n📅 Expected delivery: ${estimatedDate}\n\nRemember your delivery code when the rider arrives.`,
        rich_content: { job_number: job.job_number, new_status: "in_transit", driver_name: driver.name, estimated_delivery_date: job.estimated_delivery_date },
        tracking_number: job.job_number,
      }),
    }).catch(() => {});

    // Notify main API about status change
    await notifyStatusChange({
      job_number: job.job_number,
      store_order_id: job.store_order_id,
      new_status: "in_transit",
      pickup_verified: true,
    });

    return NextResponse.json({
      message: "Pickup verified! Package received.",
      delivery: updated,
    }, { headers });
  } catch (err) {
    console.error("Error verifying pickup:", err);
    return NextResponse.json({ error: "Verification failed" }, { status: 500, headers });
  }
}
