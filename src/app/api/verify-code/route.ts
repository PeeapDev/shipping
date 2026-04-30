import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { authenticateShippingRequest } from "@/lib/shipping-auth";
import { authenticateServiceCall } from "@/lib/auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { sendShippingUpdateToChat } from "@/lib/chat-client";
import { notifyStatusChange } from "@/lib/status-webhook";
import { uploadToR2 } from "@/lib/r2";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

/** Upload a base64 data URL proof photo to R2. Returns the public URL or the original base64 if R2 fails. */
async function uploadProofPhoto(base64DataUrl: string, jobNumber: string): Promise<string> {
  try {
    // Extract binary from data URL
    const match = base64DataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return base64DataUrl;
    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const buffer = Buffer.from(match[2], "base64");
    const key = `delivery-proofs/${jobNumber}/${Date.now()}.${ext}`;
    const url = await uploadToR2(buffer.buffer, key, `image/${match[1]}`);
    return url || base64DataUrl; // fall back to base64 if R2 not configured
  } catch {
    return base64DataUrl;
  }
}

/**
 * POST /api/verify-code
 *
 * Three modes:
 *
 * 1. PICKUP PREVIEW — { code: "123456", preview: true }
 *    Returns the matched delivery WITHOUT changing status.
 *    Used by the dispatch page to show order details before collecting.
 *
 * 2. PICKUP CONFIRM — { code: "123456" }
 *    Verifies pickup code, transitions to in_transit, sends notifications.
 *
 * 3. DELIVERY CONFIRM — { job_id: "uuid", order_number: "SHP-xxx", proof_photo?: "base64..." }
 *    Verifies order number matches the job, transitions to completed,
 *    calculates driver earnings, sends notifications.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  // Accept shipping staff, JWT, or service calls
  const isService = authenticateServiceCall(request);
  const shippingAuth = !isService ? authenticateShippingRequest(request) : null;
  const auth = !isService && !shippingAuth ? await authenticateRequest(request) : null;

  if (!isService && !shippingAuth && !auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const body = await request.json();
    const { code, preview, job_id, order_number, proof_photo } = body;

    // ────────────────────────────────────────
    // MODE 3: DELIVERY CONFIRMATION (by order_number)
    // ────────────────────────────────────────
    if (job_id && order_number) {
      return handleDeliveryConfirmation({
        job_id,
        order_number,
        proof_photo,
        userId: auth?.sub || shippingAuth?.sub || null,
        headers,
      });
    }

    // ────────────────────────────────────────
    // MODE 1 & 2: PICKUP (by code)
    // ────────────────────────────────────────
    if (!code || typeof code !== "string" || (code.length !== 4 && code.length !== 6)) {
      return NextResponse.json({ error: "A 6-digit code is required" }, { status: 400, headers });
    }

    // Try to find a delivery by pickup_code
    const { data: pickupMatch } = await supabase
      .from("delivery_jobs")
      .select("*, driver:drivers!delivery_jobs_driver_id_fkey(*)")
      .eq("pickup_code", code)
      .in("status", ["pending", "assigned"])
      .limit(1)
      .maybeSingle();

    if (pickupMatch) {
      // ── MODE 1: PREVIEW — return order with limited fields (no sensitive customer data to random callers) ──
      if (preview) {
        return NextResponse.json({
          verified: "pickup_preview",
          message: "Order found. Review details and approve collection.",
          delivery: {
            id: pickupMatch.id,
            job_number: pickupMatch.job_number,
            status: pickupMatch.status,
            merchant_name: pickupMatch.merchant_name,
            customer_name: pickupMatch.customer_name,
            pickup_address: pickupMatch.pickup_address,
            pickup_city: pickupMatch.pickup_city,
            pickup_instructions: pickupMatch.pickup_instructions,
            delivery_address: pickupMatch.delivery_address,
            delivery_city: pickupMatch.delivery_city,
            delivery_instructions: pickupMatch.delivery_instructions,
            customer_phone: pickupMatch.customer_phone,
            shipping_fee: pickupMatch.shipping_fee,
            package_description: pickupMatch.package_description,
            package_size: pickupMatch.package_size,
            items: pickupMatch.items,
            is_cod: pickupMatch.is_cod,
            cod_amount: pickupMatch.cod_amount,
            estimated_delivery_date: pickupMatch.estimated_delivery_date,
            created_at: pickupMatch.created_at,
            driver: pickupMatch.driver,
            metadata: pickupMatch.metadata,
          },
        }, { headers });
      }

      // ── MODE 2: CONFIRM PICKUP — transition to in_transit ──
      const now = new Date().toISOString();
      const { data: updated } = await supabase
        .from("delivery_jobs")
        .update({ status: "in_transit", actual_pickup_time: now, pickup_verified_at: now, updated_at: now })
        .eq("id", pickupMatch.id)
        .select("*, driver:drivers!delivery_jobs_driver_id_fkey(*)")
        .single();

      // Look up dispatcher name for tracking
      const dispatcherId = auth?.sub || shippingAuth?.sub || null;
      let dispatcherName = "Staff";
      if (dispatcherId) {
        const { data: staff } = await supabase.from("shipping_staff").select("name").eq("user_id", dispatcherId).single();
        if (staff?.name) dispatcherName = staff.name;
      }

      await supabase.from("tracking_updates").insert([
        { job_id: pickupMatch.id, status: "picked_up", message: `Pickup verified by ${dispatcherName}. Package collected from vendor.`, updated_by: dispatcherId },
        { job_id: pickupMatch.id, status: "in_transit", message: `Package dispatched by ${dispatcherName}. On the way to delivery address.`, updated_by: dispatcherId },
      ]);

      // Notify main API
      notifyStatusChange({
        job_number: pickupMatch.job_number,
        store_order_id: pickupMatch.store_order_id,
        new_status: "in_transit",
        pickup_verified: true,
      });

      // Chat: notify vendor — product received, will be delivered
      const meta = (pickupMatch.metadata as Record<string, string>) || {};
      const storeId = meta.store_id || pickupMatch.merchant_id;
      const storeName = meta.store_name || pickupMatch.merchant_name || "Store";
      const driverName = pickupMatch.driver?.name || updated?.driver?.name || "A rider";
      const CHAT_API = process.env.CHAT_API_URL || "https://chat.peeap.com";
      const SERVICE_SECRET = process.env.SERVICE_SECRET || "";

      // Vendor message: "Product received, will be delivered to [buyer]"
      fetch(`${CHAT_API}/api/ecommerce/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Service-Secret": SERVICE_SECRET },
        body: JSON.stringify({
          order_id: pickupMatch.job_number,
          store_id: storeId,
          buyer_user_id: pickupMatch.merchant_id,
          seller_user_id: pickupMatch.merchant_id,
          category: "shipping_update",
          content: `Thanks! The product has been received by ${driverName} and will be delivered to ${pickupMatch.customer_name || "the customer"} at ${pickupMatch.delivery_address || "their address"}.\n\nTracking: shipping.peeap.com/track/${pickupMatch.job_number}`,
          rich_content: {
            job_number: pickupMatch.job_number,
            new_status: "pickup_verified",
            driver_name: driverName,
            customer_name: pickupMatch.customer_name,
            delivery_address: pickupMatch.delivery_address,
          },
          tracking_number: pickupMatch.job_number,
        }),
      }).catch(() => {});

      // Buyer message: "Be ready to receive your product"
      fetch(`${CHAT_API}/api/ecommerce/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Service-Secret": SERVICE_SECRET },
        body: JSON.stringify({
          order_id: pickupMatch.job_number,
          store_id: storeId,
          buyer_user_id: pickupMatch.customer_id,
          seller_user_id: pickupMatch.merchant_id,
          category: "shipping_update",
          content: `Your package from ${storeName} has been picked up by ${driverName} and is on its way!\n\nPlease be ready to receive your product. You will need your delivery code when the rider arrives.\n\nTracking: shipping.peeap.com/track/${pickupMatch.job_number}`,
          rich_content: {
            job_number: pickupMatch.job_number,
            new_status: "in_transit",
            driver_name: driverName,
            store_name: storeName,
            tracking_url: `https://shipping.peeap.com/track/${pickupMatch.job_number}`,
          },
          tracking_number: pickupMatch.job_number,
        }),
      }).catch(() => {});

      // Notify main API for in-app notification
      const MAIN_API = process.env.MAIN_API_URL || "https://api.peeap.com";
      // Buyer notification
      fetch(`${MAIN_API}/api/notifications/internal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Service-Secret": SERVICE_SECRET },
        body: JSON.stringify({
          user_id: pickupMatch.customer_id,
          type: "store_order_shipped",
          title: "Your order is on the way!",
          message: `Your package from ${storeName} has been picked up and is being delivered to you.`,
          action_url: `/track/${pickupMatch.job_number}`,
          source_service: "shipping",
          priority: "high",
        }),
      }).catch(() => {});

      // Vendor notification
      fetch(`${MAIN_API}/api/notifications/internal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Service-Secret": SERVICE_SECRET },
        body: JSON.stringify({
          user_id: pickupMatch.merchant_id,
          type: "shipping_update",
          title: "Package collected by rider",
          message: `Your package for order ${pickupMatch.job_number} has been collected by ${driverName} for delivery.`,
          action_url: `/track/${pickupMatch.job_number}`,
          source_service: "shipping",
          priority: "normal",
        }),
      }).catch(() => {});

      return NextResponse.json({
        verified: "pickup",
        message: "Pickup verified! Package is now in transit.",
        delivery: updated,
      }, { headers });
    }

    // Try delivery_code match (buyer's unique code at delivery)
    const { data: deliveryMatch } = await supabase
      .from("delivery_jobs")
      .select("*, driver:drivers!delivery_jobs_driver_id_fkey(*)")
      .eq("delivery_code", code)
      .in("status", ["in_transit"])
      .limit(1)
      .maybeSingle();

    if (deliveryMatch) {
      if (preview) {
        return NextResponse.json({
          verified: "delivery_preview",
          message: "Delivery order found. Proceed to take proof photo.",
          delivery: {
            id: deliveryMatch.id,
            job_number: deliveryMatch.job_number,
            status: deliveryMatch.status,
            merchant_name: deliveryMatch.merchant_name,
            customer_name: deliveryMatch.customer_name,
            delivery_address: deliveryMatch.delivery_address,
            shipping_fee: deliveryMatch.shipping_fee,
            package_description: deliveryMatch.package_description,
            package_size: deliveryMatch.package_size,
          },
        }, { headers });
      }

      // Complete delivery
      const now = new Date().toISOString();
      const updateData: Record<string, unknown> = {
        status: "completed",
        actual_delivery_time: now,
        delivery_verified_at: now,
        updated_at: now,
      };
      if (proof_photo) {
        updateData.proof_of_delivery_url = await uploadProofPhoto(proof_photo, deliveryMatch.job_number);
      }

      const { data: updated } = await supabase
        .from("delivery_jobs")
        .update(updateData)
        .eq("id", deliveryMatch.id)
        .select()
        .single();

      await supabase.from("tracking_updates").insert([
        { job_id: deliveryMatch.id, status: "delivered", message: "Delivery code verified. Package delivered to customer.", updated_by: auth?.sub || shippingAuth?.sub || null },
        { job_id: deliveryMatch.id, status: "completed", message: "Delivery completed successfully!", updated_by: auth?.sub || shippingAuth?.sub || null },
      ]);

      // Calculate driver earnings + fee audit trail
      const shippingFee = parseFloat(String(deliveryMatch.shipping_fee)) || 0;
      const platformPct = parseFloat(String(deliveryMatch.platform_fee_pct)) || 20;
      const driverPayout = shippingFee * ((100 - platformPct) / 100);
      const platformFee = shippingFee - driverPayout;

      await supabase.from("delivery_jobs")
        .update({ driver_payout: driverPayout, platform_fee: platformFee })
        .eq("id", deliveryMatch.id);

      if (shippingFee > 0) {
        await supabase.from("fee_transactions").insert([
          { job_id: deliveryMatch.id, type: "shipping_fee_collected", amount: shippingFee, from_party: "customer", to_party: "platform", status: "completed", description: `Shipping fee for ${deliveryMatch.job_number}` },
          { job_id: deliveryMatch.id, type: "driver_payout", amount: driverPayout, from_party: "platform", to_party: "driver", status: "pending", description: `Driver payout for ${deliveryMatch.job_number}` },
          { job_id: deliveryMatch.id, type: "platform_fee_collected", amount: platformFee, from_party: "platform", to_party: "platform", status: "completed", description: `Platform fee for ${deliveryMatch.job_number}` },
        ]);
      }

      // Record earning + auto-credit wallet
      if (driverPayout > 0 && deliveryMatch.driver_id) {
        const { data: payoutRecord } = await supabase.from("driver_payouts").insert({
          driver_id: deliveryMatch.driver_id, job_id: deliveryMatch.id,
          amount: driverPayout, type: "earning", status: "pending",
          description: `Delivery ${deliveryMatch.job_number}`,
        }).select().single();

        const MAIN_API = process.env.MAIN_API_URL || "https://api.peeap.com";
        fetch(`${MAIN_API}/api/wallets/credit`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Service-Secret": process.env.SERVICE_SECRET || "" },
          body: JSON.stringify({
            user_id: deliveryMatch.driver?.user_id || auth?.sub,
            amount: driverPayout,
            description: `Delivery payout - ${deliveryMatch.job_number}`,
            reference: `shipping_payout_${payoutRecord?.id || deliveryMatch.id}`,
            source: "shipping",
          }),
        }).then(async (res) => {
          if (res.ok && payoutRecord) {
            await supabase.from("driver_payouts").update({ status: "completed" }).eq("id", payoutRecord.id);
          }
        }).catch(() => {});
      }

      // Update driver stats + free driver
      if (deliveryMatch.driver_id) {
        const { data: driver } = await supabase.from("drivers")
          .select("total_deliveries, total_earnings")
          .eq("id", deliveryMatch.driver_id).single();
        if (driver) {
          await supabase.from("drivers").update({
            total_deliveries: (driver.total_deliveries || 0) + 1,
            total_earnings: (parseFloat(String(driver.total_earnings)) || 0) + driverPayout,
            active_job_id: null, is_available: true, updated_at: now,
          }).eq("id", deliveryMatch.driver_id);
        }
      }

      // Notify main API
      notifyStatusChange({
        job_number: deliveryMatch.job_number,
        store_order_id: deliveryMatch.store_order_id,
        new_status: "completed",
        delivery_verified: true,
      });

      // 3-party chat notifications
      const meta = (deliveryMatch.metadata as Record<string, string>) || {};
      const storeId = meta.store_id || deliveryMatch.merchant_id;
      const storeName = meta.store_name || deliveryMatch.merchant_name || "Store";
      const CHAT_API = process.env.CHAT_API_URL || "https://chat.peeap.com";
      const SVC_SECRET = process.env.SERVICE_SECRET || "";
      const MAIN_API_URL = process.env.MAIN_API_URL || "https://api.peeap.com";

      // Vendor: "Product delivered"
      fetch(`${CHAT_API}/api/ecommerce/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Service-Secret": SVC_SECRET },
        body: JSON.stringify({
          order_id: deliveryMatch.job_number, store_id: storeId,
          buyer_user_id: deliveryMatch.merchant_id, seller_user_id: deliveryMatch.merchant_id,
          category: "delivery_confirmed",
          content: `Product delivered! Order ${deliveryMatch.job_number} has been successfully delivered to ${deliveryMatch.customer_name || "the customer"}.\n\nShipping fee: NLe ${shippingFee.toFixed(0)}.`,
          rich_content: { job_number: deliveryMatch.job_number, new_status: "completed", customer_name: deliveryMatch.customer_name },
          tracking_number: deliveryMatch.job_number,
        }),
      }).catch(() => {});

      // Buyer: "Delivered — rate your experience"
      fetch(`${CHAT_API}/api/ecommerce/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Service-Secret": SVC_SECRET },
        body: JSON.stringify({
          order_id: deliveryMatch.job_number, store_id: storeId,
          buyer_user_id: deliveryMatch.customer_id, seller_user_id: deliveryMatch.merchant_id,
          category: "delivery_confirmed",
          content: `Your order from ${storeName} has been delivered!\n\nThank you for your purchase. We hope you enjoy it!\n\nPlease rate your delivery experience.`,
          rich_content: { job_number: deliveryMatch.job_number, store_name: storeName, new_status: "completed", driver_name: deliveryMatch.driver?.name, show_rating: true, delivery_id: deliveryMatch.id },
          tracking_number: deliveryMatch.job_number,
        }),
      }).catch(() => {});

      // In-app notifications
      fetch(`${MAIN_API_URL}/api/notifications/internal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Service-Secret": SVC_SECRET },
        body: JSON.stringify({ user_id: deliveryMatch.customer_id, type: "store_order_delivered", title: "Your order has been delivered!", message: `Your package from ${storeName} has been delivered. Rate your experience!`, action_url: `/orders`, source_service: "shipping", priority: "high" }),
      }).catch(() => {});

      fetch(`${MAIN_API_URL}/api/notifications/internal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Service-Secret": SVC_SECRET },
        body: JSON.stringify({ user_id: deliveryMatch.merchant_id, type: "store_order_delivered", title: "Order delivered successfully", message: `Order ${deliveryMatch.job_number} has been delivered to ${deliveryMatch.customer_name || "the customer"}.`, action_url: `/dashboard/orders`, source_service: "shipping", priority: "normal" }),
      }).catch(() => {});

      return NextResponse.json({
        verified: "delivery",
        message: "Delivery completed! Package delivered successfully.",
        delivery: updated,
        earnings: driverPayout,
      }, { headers });
    }

    // No match
    return NextResponse.json({
      verified: null,
      error: "No matching delivery found for this code. Check the code and try again.",
    }, { status: 404, headers });
  } catch (err) {
    console.error("Error verifying code:", err);
    return NextResponse.json({ error: "Verification failed" }, { status: 500, headers });
  }
}

// ────────────────────────────────────────────────────
// DELIVERY CONFIRMATION — by order_number + proof photo
// ────────────────────────────────────────────────────

async function handleDeliveryConfirmation(params: {
  job_id: string;
  order_number: string;
  proof_photo?: string;
  userId: string | null;
  headers: Record<string, string>;
}) {
  const { job_id, order_number, proof_photo, userId, headers } = params;

  // Fetch the job
  const { data: job, error: fetchErr } = await supabase
    .from("delivery_jobs")
    .select("*, driver:drivers!delivery_jobs_driver_id_fkey(*)")
    .eq("id", job_id)
    .single();

  if (fetchErr || !job) {
    return NextResponse.json({ error: "Delivery job not found" }, { status: 404, headers });
  }

  // Verify order number matches (check both job_number and metadata.order_number)
  const meta = (job.metadata as Record<string, string>) || {};
  const matchesJobNumber = job.job_number === order_number;
  const matchesOrderNumber = meta.order_number === order_number;
  if (!matchesJobNumber && !matchesOrderNumber) {
    return NextResponse.json({
      error: "Order number does not match. Ask the customer for the correct order number.",
    }, { status: 400, headers });
  }

  if (job.status !== "in_transit") {
    return NextResponse.json({
      error: `Job must be in 'in_transit' status for delivery confirmation. Current: ${job.status}`,
    }, { status: 400, headers });
  }

  // Complete the delivery
  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = {
    status: "completed",
    actual_delivery_time: now,
    delivery_verified_at: now,
    updated_at: now,
  };

  if (proof_photo) {
    updateData.proof_of_delivery_url = await uploadProofPhoto(proof_photo, job.job_number);
  }

  const { data: updated, error: updateErr } = await supabase
    .from("delivery_jobs")
    .update(updateData)
    .eq("id", job_id)
    .select("*, driver:drivers!delivery_jobs_driver_id_fkey(*)")
    .single();

  if (updateErr) throw updateErr;

  // Tracking updates
  await supabase.from("tracking_updates").insert([
    {
      job_id,
      status: "delivered",
      message: `Order number verified (${order_number}). Package delivered to customer.${proof_photo ? " Proof of delivery captured." : ""}`,
      updated_by: userId,
    },
    {
      job_id,
      status: "completed",
      message: "Delivery completed successfully!",
      updated_by: userId,
    },
  ]);

  // Calculate and record driver earnings
  const shippingFee = parseFloat(String(job.shipping_fee)) || 0;
  const platformPct = parseFloat(String(job.platform_fee_pct)) || 20;
  const driverPayout = shippingFee * ((100 - platformPct) / 100);
  const platformFee = shippingFee - driverPayout;

  await supabase
    .from("delivery_jobs")
    .update({ driver_payout: driverPayout, platform_fee: platformFee })
    .eq("id", job_id);

  // Record fee audit trail
  if (shippingFee > 0) {
    await supabase.from("fee_transactions").insert([
      { job_id, type: "shipping_fee_collected", amount: shippingFee, from_party: "customer", to_party: "platform", status: "completed", description: `Shipping fee for ${job.job_number}` },
      { job_id, type: "driver_payout", amount: driverPayout, from_party: "platform", to_party: "driver", status: "pending", description: `Driver payout for ${job.job_number}` },
      { job_id, type: "platform_fee_collected", amount: platformFee, from_party: "platform", to_party: "platform", status: "completed", description: `Platform fee for ${job.job_number}` },
    ]);
  }

  // Record driver earning + wallet credit
  if (driverPayout > 0 && job.driver_id) {
    const { data: payoutRecord } = await supabase.from("driver_payouts").insert({
      driver_id: job.driver_id, job_id, amount: driverPayout,
      type: "earning", status: "pending", description: `Delivery ${job.job_number}`,
    }).select().single();

    // Auto-credit driver wallet
    const MAIN_API = process.env.MAIN_API_URL || "https://api.peeap.com";
    const SERVICE_SECRET = process.env.SERVICE_SECRET || "";
    fetch(`${MAIN_API}/api/wallets/credit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Service-Secret": SERVICE_SECRET },
      body: JSON.stringify({
        user_id: job.driver?.user_id || userId,
        amount: driverPayout,
        description: `Delivery payout - ${job.job_number}`,
        reference: `shipping_payout_${payoutRecord?.id || job_id}`,
        source: "shipping",
      }),
    }).then(async (res) => {
      if (res.ok && payoutRecord) {
        await supabase.from("driver_payouts").update({ status: "completed" }).eq("id", payoutRecord.id);
      }
    }).catch(() => {});
  }

  // Update driver stats + free up driver
  if (job.driver_id) {
    const { data: driver } = await supabase
      .from("drivers")
      .select("total_deliveries, total_earnings")
      .eq("id", job.driver_id)
      .single();

    if (driver) {
      await supabase.from("drivers").update({
        total_deliveries: (driver.total_deliveries || 0) + 1,
        total_earnings: (parseFloat(String(driver.total_earnings)) || 0) + driverPayout,
        active_job_id: null,
        is_available: true,
        updated_at: now,
      }).eq("id", job.driver_id);
    }
  }

  // Notify main API
  notifyStatusChange({
    job_number: job.job_number,
    store_order_id: job.store_order_id,
    new_status: "completed",
    delivery_verified: true,
  });

  // ── Send 3-party completion notifications ──
  const storeId = meta.store_id || job.merchant_id;
  const storeName = meta.store_name || job.merchant_name || "Store";
  const CHAT_API = process.env.CHAT_API_URL || "https://chat.peeap.com";
  const SERVICE_SECRET = process.env.SERVICE_SECRET || "";
  const MAIN_API = process.env.MAIN_API_URL || "https://api.peeap.com";

  // Vendor: "Product delivered"
  fetch(`${CHAT_API}/api/ecommerce/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Service-Secret": SERVICE_SECRET },
    body: JSON.stringify({
      order_id: job.job_number,
      store_id: storeId,
      buyer_user_id: job.merchant_id,
      seller_user_id: job.merchant_id,
      category: "delivery_confirmed",
      content: `Product delivered! Order ${job.job_number} has been successfully delivered to ${job.customer_name || "the customer"}.\n\nShipping fee: NLe ${shippingFee.toFixed(0)}.`,
      rich_content: { job_number: job.job_number, new_status: "completed", customer_name: job.customer_name },
      tracking_number: job.job_number,
    }),
  }).catch(() => {});

  // Buyer: "Delivered — rate your experience"
  fetch(`${CHAT_API}/api/ecommerce/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Service-Secret": SERVICE_SECRET },
    body: JSON.stringify({
      order_id: job.job_number,
      store_id: storeId,
      buyer_user_id: job.customer_id,
      seller_user_id: job.merchant_id,
      category: "delivery_confirmed",
      content: `Your order from ${storeName} has been delivered!\n\nThank you for your purchase. We hope you enjoy it!\n\nPlease rate your delivery experience.`,
      rich_content: {
        job_number: job.job_number,
        store_name: storeName,
        new_status: "completed",
        driver_name: job.driver?.name,
        show_rating: true,
        delivery_id: job_id,
      },
      tracking_number: job.job_number,
    }),
  }).catch(() => {});

  // In-app notifications
  fetch(`${MAIN_API}/api/notifications/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Service-Secret": SERVICE_SECRET },
    body: JSON.stringify({
      user_id: job.customer_id,
      type: "store_order_delivered",
      title: "Your order has been delivered!",
      message: `Your package from ${storeName} has been delivered. Rate your experience!`,
      action_url: `/orders`,
      source_service: "shipping",
      priority: "high",
    }),
  }).catch(() => {});

  fetch(`${MAIN_API}/api/notifications/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Service-Secret": SERVICE_SECRET },
    body: JSON.stringify({
      user_id: job.merchant_id,
      type: "store_order_delivered",
      title: "Order delivered successfully",
      message: `Order ${job.job_number} has been delivered to ${job.customer_name || "the customer"}.`,
      action_url: `/dashboard/orders`,
      source_service: "shipping",
      priority: "normal",
    }),
  }).catch(() => {});

  return NextResponse.json({
    verified: "delivery",
    message: "Delivery completed! Package delivered successfully.",
    delivery: updated,
    earnings: driverPayout,
  }, { headers });
}
