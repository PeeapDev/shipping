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
 * POST /api/driver/jobs/[id]/verify-delivery
 * Rider enters the 4-digit code that the buyer gives them.
 * This confirms the physical handoff from rider → buyer.
 *
 * Flow: in_transit → (rider enters buyer code) → delivered → completed
 * Messages: buyer (delivered + rate driver), vendor (delivered ✓), shipping (complete)
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
    const { code, cod_collected } = await request.json();
    if (!code || typeof code !== "string" || (code.length !== 4 && code.length !== 6)) {
      return NextResponse.json({ error: "A 6-digit delivery code is required" }, { status: 400, headers });
    }

    // Find driver
    const { data: driver } = await supabase
      .from("drivers")
      .select("id, name, total_deliveries, total_earnings")
      .eq("user_id", auth.sub)
      .eq("is_active", true)
      .single();

    if (!driver) {
      return NextResponse.json({ error: "Driver not found" }, { status: 404, headers });
    }

    // Fetch job
    const { data: job } = await supabase
      .from("delivery_jobs")
      .select("id, status, driver_id, delivery_code, job_number, customer_id, customer_name, merchant_id, merchant_name, delivery_address, shipping_fee, platform_fee_pct, is_cod, cod_amount, metadata")
      .eq("id", params.id)
      .eq("driver_id", driver.id)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job not found or not assigned to you" }, { status: 404, headers });
    }

    if (job.status !== "in_transit") {
      return NextResponse.json({ error: "Job must be in 'in_transit' status for delivery verification" }, { status: 400, headers });
    }

    // Verify the code
    if (code !== job.delivery_code) {
      return NextResponse.json({ error: "Invalid delivery code. Ask the customer for the correct code." }, { status: 400, headers });
    }

    // Validate COD collection if applicable
    if (job.is_cod && job.cod_amount > 0 && !cod_collected) {
      return NextResponse.json(
        { error: "This is a COD delivery. Confirm that cash has been collected (cod_collected: true)." },
        { status: 400, headers }
      );
    }

    // Code verified — transition: in_transit → delivered → completed
    const now = new Date().toISOString();
    const codUpdate: Record<string, unknown> = {};
    if (job.is_cod) {
      codUpdate.cod_collected = true;
      codUpdate.cod_collected_at = now;
    }

    const { data: updated, error: updateError } = await supabase
      .from("delivery_jobs")
      .update({
        status: "completed",
        actual_delivery_time: now,
        delivery_verified_at: now,
        updated_at: now,
        ...codUpdate,
      })
      .eq("id", params.id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Create tracking updates
    await supabase.from("tracking_updates").insert([
      {
        job_id: params.id,
        status: "delivered",
        message: `Delivery verified (code: ${code}). Package delivered to customer.`,
        updated_by: auth.sub,
      },
      {
        job_id: params.id,
        status: "completed",
        message: "Delivery completed successfully!",
        updated_by: auth.sub,
      },
    ]);

    // ── Calculate and record driver earnings ──
    const shippingFee = parseFloat(String(job.shipping_fee)) || 0;
    const platformPct = parseFloat(String(job.platform_fee_pct)) || 20;
    const driverPayout = shippingFee * ((100 - platformPct) / 100);
    const platformFee = shippingFee - driverPayout;

    await supabase
      .from("delivery_jobs")
      .update({ driver_payout: driverPayout, platform_fee: platformFee })
      .eq("id", params.id);

    // Record fee audit trail
    if (shippingFee > 0) {
      await supabase.from("fee_transactions").insert([
        {
          job_id: params.id,
          type: "shipping_fee_collected",
          amount: shippingFee,
          from_party: "customer",
          to_party: "platform",
          status: "completed",
          description: `Shipping fee for ${job.job_number}`,
        },
        {
          job_id: params.id,
          type: "driver_payout",
          amount: driverPayout,
          from_party: "platform",
          to_party: "driver",
          status: "pending",
          description: `Driver payout for ${job.job_number}`,
        },
        {
          job_id: params.id,
          type: "platform_fee_collected",
          amount: platformFee,
          from_party: "platform",
          to_party: "platform",
          status: "completed",
          description: `Platform fee for ${job.job_number}`,
        },
      ]);
    }

    // Record earning
    if (driverPayout > 0) {
      const { data: payoutRecord } = await supabase.from("driver_payouts").insert({
        driver_id: driver.id,
        job_id: params.id,
        amount: driverPayout,
        type: "earning",
        status: job.is_cod ? "completed" : "pending",
        description: `Delivery ${job.job_number}${job.is_cod ? " (COD - cash collected)" : ""}`,
      }).select().single();

      // For non-COD: driver gets digital wallet payout.
      // For COD: driver already collected cash (including shipping fee), no digital payout.
      if (!job.is_cod) {
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
            await supabase.from("driver_payouts").update({ status: "completed" }).eq("id", payoutRecord.id);
          }
        }).catch(() => {});
      }
    }

    // ── COD vendor settlement ──
    // Driver collected cash from customer. Credit the vendor's wallet for the
    // product value (COD total minus shipping fee). The driver keeps their
    // share of the shipping fee from the cash they collected.
    if (job.is_cod && job.cod_amount > 0 && job.merchant_id) {
      const codAmount = parseFloat(String(job.cod_amount));
      const vendorAmount = codAmount - shippingFee;

      if (vendorAmount > 0) {
        const MAIN_API = process.env.MAIN_API_URL || "https://api.peeap.com";
        fetch(`${MAIN_API}/api/wallets/credit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Service-Secret": process.env.SERVICE_SECRET || "",
          },
          body: JSON.stringify({
            user_id: job.merchant_id,
            amount: vendorAmount,
            description: `COD settlement - ${job.job_number}`,
            reference: `cod_settlement_${params.id}`,
            source: "shipping",
          }),
        }).then(async (res) => {
          const status = res.ok ? "completed" : "failed";
          await supabase.from("fee_transactions").insert({
            job_id: params.id,
            type: "cod_vendor_settlement",
            amount: vendorAmount,
            from_party: "driver_cash",
            to_party: "merchant",
            status,
            description: `COD vendor settlement for ${job.job_number}${status === "failed" ? " — NEEDS MANUAL RECONCILIATION" : ""}`,
          });
          if (!res.ok) {
            console.error(`[COD] Vendor settlement failed for ${job.job_number} — vendor owed NLe ${vendorAmount}`);
          }
        }).catch(() => {
          console.error(`[COD] Vendor settlement unreachable for ${job.job_number}`);
        });

        // Record the platform's share from COD cash
        await supabase.from("fee_transactions").insert({
          job_id: params.id,
          type: "cod_platform_fee",
          amount: platformFee,
          from_party: "driver_cash",
          to_party: "platform",
          status: "completed",
          description: `Platform share from COD delivery ${job.job_number}`,
        });
      }
    }

    // Update driver stats
    await supabase
      .from("drivers")
      .update({
        total_deliveries: (driver.total_deliveries || 0) + 1,
        total_earnings: (parseFloat(String(driver.total_earnings)) || 0) + driverPayout,
        active_job_id: null,
        is_available: true,
        updated_at: now,
      })
      .eq("id", driver.id);

    // ── Send 3-party completion notifications ──
    const meta = (job.metadata as Record<string, string>) || {};
    const storeId = meta.store_id || job.merchant_id;
    const storeName = meta.store_name || job.merchant_name || "Store";
    const CHAT_API = process.env.CHAT_API_URL || "https://chat.peeap.com";
    const SERVICE_SECRET = process.env.SERVICE_SECRET || "";

    // 1. Buyer: "Delivery complete! Rate your driver."
    await fetch(`${CHAT_API}/api/ecommerce/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Service-Secret": SERVICE_SECRET },
      body: JSON.stringify({
        order_id: job.job_number,
        store_id: storeId,
        buyer_user_id: job.customer_id,
        seller_user_id: job.merchant_id,
        category: "delivery_confirmed",
        content: `✅ Your order from ${storeName} has been delivered!\n\nDelivery code verified. Thank you for your purchase!\n\n⭐ Please rate your delivery experience.`,
        rich_content: {
          job_number: job.job_number,
          store_name: storeName,
          new_status: "completed",
          driver_name: driver.name,
          show_rating: true,
          delivery_id: params.id,
        },
        tracking_number: job.job_number,
      }),
    }).catch(() => {});

    // 2. Vendor: "Order delivered to customer"
    await fetch(`${CHAT_API}/api/ecommerce/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Service-Secret": SERVICE_SECRET },
      body: JSON.stringify({
        order_id: job.job_number,
        store_id: storeId,
        buyer_user_id: job.merchant_id,
        seller_user_id: job.merchant_id,
        category: "delivery_confirmed",
        content: `✅ Order ${job.job_number} has been delivered to ${job.customer_name || "the customer"}.\n\nDelivery verified. Shipping fee: NLe ${shippingFee.toFixed(0)}.`,
        rich_content: { job_number: job.job_number, new_status: "completed", customer_name: job.customer_name },
        tracking_number: job.job_number,
      }),
    }).catch(() => {});

    // Notify main API about delivery completion
    await notifyStatusChange({
      job_number: job.job_number,
      store_order_id: (job as any).store_order_id,
      new_status: "completed",
      delivery_verified: true,
    });

    return NextResponse.json({
      message: "Delivery verified! Job completed.",
      delivery: updated,
      earnings: driverPayout,
    }, { headers });
  } catch (err) {
    console.error("Error verifying delivery:", err);
    return NextResponse.json({ error: "Verification failed" }, { status: 500, headers });
  }
}
