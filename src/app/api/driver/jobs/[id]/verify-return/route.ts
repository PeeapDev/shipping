import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { authenticateRequest } from "@/lib/auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

/**
 * POST /api/driver/jobs/[id]/verify-return
 *
 * Two-step process:
 *   Step 1: Rider initiates return (reason required) → status: "returning"
 *           A return_code is generated and sent to the vendor.
 *   Step 2: Rider enters vendor's return_code → status: "returned"
 *           Triggers: driver payout reversal, customer refund, 3-party notifications.
 *
 * Body:
 *   { action: "initiate", reason: "Customer not available" }
 *   { action: "verify", code: "1234" }
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
    const body = await request.json();
    const { action } = body;

    if (!["initiate", "verify"].includes(action)) {
      return NextResponse.json({ error: "action must be 'initiate' or 'verify'" }, { status: 400, headers });
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

    // Fetch job
    const { data: job } = await supabase
      .from("delivery_jobs")
      .select("*")
      .eq("id", params.id)
      .eq("driver_id", driver.id)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job not found or not assigned to you" }, { status: 404, headers });
    }

    const CHAT_API = process.env.CHAT_API_URL || "https://chat.peeap.com";
    const SERVICE_SECRET = process.env.SERVICE_SECRET || "";
    const meta = (job.metadata as Record<string, string>) || {};
    const storeId = meta.store_id || job.merchant_id;
    const storeName = meta.store_name || job.merchant_name || "Store";

    // ── STEP 1: Initiate return ──
    if (action === "initiate") {
      const { reason } = body;
      if (!reason || typeof reason !== "string") {
        return NextResponse.json({ error: "Return reason is required" }, { status: 400, headers });
      }

      // Can only initiate return from: in_transit, failed
      if (!["in_transit", "failed"].includes(job.status)) {
        return NextResponse.json(
          { error: `Cannot initiate return from status "${job.status}". Must be in_transit or failed.` },
          { status: 400, headers }
        );
      }

      // Generate a 4-digit return code
      const returnCode = String(randomInt(1000, 10000));

      const now = new Date().toISOString();
      await supabase
        .from("delivery_jobs")
        .update({
          status: "returning",
          return_reason: reason,
          return_code: returnCode,
          updated_at: now,
        })
        .eq("id", params.id);

      await supabase.from("tracking_updates").insert({
        job_id: params.id,
        status: "returning",
        message: `Return initiated: ${reason}. Rider is bringing the package back to vendor.`,
        updated_by: auth.sub,
      });

      // Notify vendor: "Rider is returning the package. Return code: XXXX"
      fetch(`${CHAT_API}/api/ecommerce/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Service-Secret": SERVICE_SECRET },
        body: JSON.stringify({
          order_id: job.job_number,
          store_id: storeId,
          buyer_user_id: job.merchant_id,
          seller_user_id: job.merchant_id,
          category: "shipping_update",
          content: `📦 Package for order ${job.job_number} is being returned to you.\n\nReason: ${reason}\n🔑 Return code: ${returnCode}\n\nGive this code to the rider when they return the package.`,
          rich_content: { job_number: job.job_number, new_status: "returning", return_code: returnCode, reason },
          tracking_number: job.job_number,
        }),
      }).catch(() => {});

      // Notify buyer: "Your package is being returned to the store"
      fetch(`${CHAT_API}/api/ecommerce/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Service-Secret": SERVICE_SECRET },
        body: JSON.stringify({
          order_id: job.job_number,
          store_id: storeId,
          buyer_user_id: job.customer_id,
          seller_user_id: job.merchant_id,
          category: "shipping_update",
          content: `⚠️ Your delivery from ${storeName} could not be completed.\n\nReason: ${reason}\n\nThe package is being returned to the store. A refund will be processed once the return is confirmed.`,
          rich_content: { job_number: job.job_number, new_status: "returning", reason },
          tracking_number: job.job_number,
        }),
      }).catch(() => {});

      return NextResponse.json({
        message: "Return initiated. Bring the package back to the vendor.",
        return_code: returnCode,
      }, { headers });
    }

    // ── STEP 2: Verify return (rider enters vendor's return code) ──
    const { code } = body;
    if (!code || typeof code !== "string" || code.length !== 4) {
      return NextResponse.json({ error: "A 4-digit return code is required" }, { status: 400, headers });
    }

    if (job.status !== "returning") {
      return NextResponse.json({ error: "Job must be in 'returning' status" }, { status: 400, headers });
    }

    if (code !== job.return_code) {
      return NextResponse.json({ error: "Invalid return code. Ask the vendor for the correct code." }, { status: 400, headers });
    }

    // Code verified — complete the return
    const now = new Date().toISOString();
    const { data: updated } = await supabase
      .from("delivery_jobs")
      .update({
        status: "returned",
        return_verified_at: now,
        refund_status: "pending",
        refund_amount: parseFloat(String(job.shipping_fee)) || 0,
        updated_at: now,
      })
      .eq("id", params.id)
      .select()
      .single();

    await supabase.from("tracking_updates").insert({
      job_id: params.id,
      status: "returned",
      message: "Package returned to vendor. Return code verified.",
      updated_by: auth.sub,
    });

    // ── Reverse driver payout if it was already paid ──
    const { data: existingPayout } = await supabase
      .from("driver_payouts")
      .select("id, amount, status")
      .eq("job_id", params.id)
      .eq("type", "earning")
      .maybeSingle();

    if (existingPayout && existingPayout.status === "completed") {
      // Record reversal
      await supabase.from("driver_payouts").insert({
        driver_id: driver.id,
        job_id: params.id,
        amount: existingPayout.amount,
        type: "deduction",
        status: "completed",
        description: `Return reversal - ${job.job_number}`,
      });

      // Update driver earnings
      const { data: driverData } = await supabase
        .from("drivers")
        .select("total_deliveries, total_earnings")
        .eq("id", driver.id)
        .single();

      if (driverData) {
        await supabase.from("drivers").update({
          total_deliveries: Math.max(0, (driverData.total_deliveries || 0) - 1),
          total_earnings: Math.max(0, (parseFloat(String(driverData.total_earnings)) || 0) - existingPayout.amount),
          updated_at: now,
        }).eq("id", driver.id);
      }
    }

    // Free the driver
    await supabase.from("drivers").update({
      active_job_id: null,
      is_available: true,
      updated_at: now,
    }).eq("id", driver.id);

    // Record fee audit trail
    const shippingFee = parseFloat(String(job.shipping_fee)) || 0;
    if (shippingFee > 0) {
      await supabase.from("fee_transactions").insert({
        job_id: params.id,
        type: "shipping_fee_refund",
        amount: shippingFee,
        from_party: "platform",
        to_party: "customer",
        status: "pending",
        description: `Refund for returned delivery ${job.job_number}`,
      });
    }

    // ── 3-party notifications ──

    // Vendor: "Package returned, code verified"
    fetch(`${CHAT_API}/api/ecommerce/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Service-Secret": SERVICE_SECRET },
      body: JSON.stringify({
        order_id: job.job_number,
        store_id: storeId,
        buyer_user_id: job.merchant_id,
        seller_user_id: job.merchant_id,
        category: "shipping_update",
        content: `✅ Return code verified. Package for order ${job.job_number} has been returned to you.\n\nCustomer refund is being processed.`,
        rich_content: { job_number: job.job_number, new_status: "returned" },
        tracking_number: job.job_number,
      }),
    }).catch(() => {});

    // Buyer: "Package returned, refund coming"
    fetch(`${CHAT_API}/api/ecommerce/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Service-Secret": SERVICE_SECRET },
      body: JSON.stringify({
        order_id: job.job_number,
        store_id: storeId,
        buyer_user_id: job.customer_id,
        seller_user_id: job.merchant_id,
        category: "shipping_update",
        content: `📦 Your package from ${storeName} has been returned to the store.\n\n💰 A refund of NLe ${shippingFee.toFixed(0)} for shipping will be processed to your wallet.`,
        rich_content: { job_number: job.job_number, new_status: "returned", refund_amount: shippingFee },
        tracking_number: job.job_number,
      }),
    }).catch(() => {});

    // Trigger actual refund to customer wallet (fire-and-forget)
    if (shippingFee > 0) {
      const MAIN_API = process.env.MAIN_API_URL || "https://api.peeap.com";
      fetch(`${MAIN_API}/api/wallets/credit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Secret": SERVICE_SECRET,
        },
        body: JSON.stringify({
          user_id: job.customer_id,
          amount: shippingFee,
          description: `Shipping refund - ${job.job_number}`,
          reference: `shipping_refund_${params.id}`,
          source: "shipping_refund",
        }),
      }).then(async (res) => {
        if (res.ok) {
          await supabase.from("delivery_jobs")
            .update({ refund_status: "completed" })
            .eq("id", params.id);
          await supabase.from("fee_transactions")
            .update({ status: "completed" })
            .eq("job_id", params.id)
            .eq("type", "shipping_fee_refund");
        }
      }).catch(() => {});
    }

    return NextResponse.json({
      message: "Return verified! Package returned to vendor.",
      delivery: updated,
    }, { headers });
  } catch (err) {
    console.error("Error processing return:", err);
    return NextResponse.json({ error: "Return failed" }, { status: 500, headers });
  }
}
