import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomInt } from "crypto";
import { authenticateRequest, authenticateServiceCall } from "@/lib/auth";
import { authenticateShippingRequest } from "@/lib/shipping-auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { createDeliveryJobSchema } from "@/lib/validation";
import { sendShippingUpdateToChat } from "@/lib/chat-client";
import { sendPickupCodeSms, sendDeliveryCodeSms } from "@/lib/sms";
import { getShippingSettlement, deliverySettlementReply, assertShippingSettlement, SettlementConfigError } from "@/lib/settlement-config";

/** Generate a random 4-digit code (1000-9999) — column is VARCHAR(4) */
function generateCode(): string {
  return String(randomInt(1000, 10000));
}

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

// GET /api/deliveries — List deliveries (role-based filtering)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const shippingAuth = authenticateShippingRequest(request);
  const auth = shippingAuth || await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const offset = parseInt(searchParams.get("offset") || "0");
    const status = searchParams.get("status");
    const role = searchParams.get("role") || "merchant"; // merchant | driver | customer | staff
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let query = supabase
      .from("delivery_jobs")
      .select("*, driver:drivers!delivery_jobs_driver_id_fkey(*)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Check if session-authenticated user is shipping staff
    let isStaff = !!shippingAuth;
    if (!isStaff && auth) {
      const { data: staffRecord } = await supabase
        .from("shipping_staff")
        .select("id, role")
        .eq("user_id", auth.sub)
        .eq("is_active", true)
        .maybeSingle();
      isStaff = !!staffRecord;
    }

    // Shipping staff see ALL deliveries (no role filter)
    if (!isStaff) {
      // Role-based filtering for external users
      if (role === "driver") {
        const { data: driverRecord } = await supabase
          .from("drivers")
          .select("id")
          .eq("user_id", auth.sub)
          .single();

        if (!driverRecord) {
          return NextResponse.json(
            { deliveries: [], total: 0 },
            { headers }
          );
        }
        query = query.eq("driver_id", driverRecord.id);
      } else if (role === "customer") {
        query = query.eq("customer_id", auth.sub);
      } else {
        query = query.eq("merchant_id", auth.sub);
      }
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (from) {
      query = query.gte("created_at", from);
    }
    if (to) {
      query = query.lte("created_at", `${to}T23:59:59.999Z`);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const deliveries = (data || []).map((job) => isStaff ? job : {
      ...job,
      pickup_code: role === "merchant" ? job.pickup_code : undefined,
      delivery_code: role === "customer" ? job.delivery_code : undefined,
    });
    return NextResponse.json(
      { deliveries, total: count || 0 },
      { headers }
    );
  } catch (err) {
    console.error("Error fetching deliveries:", err);
    return NextResponse.json(
      { error: "Failed to fetch deliveries" },
      { status: 500, headers }
    );
  }
}

// POST /api/deliveries — Create delivery job (service-to-service or authenticated)
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  // Allow service-to-service calls, shipping staff, or JWT-authenticated users
  const isServiceCall = authenticateServiceCall(request);
  const shippingStaff = !isServiceCall ? authenticateShippingRequest(request) : null;
  const auth = !isServiceCall && !shippingStaff ? await authenticateRequest(request) : null;

  if (!isServiceCall && !shippingStaff && !auth) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers }
    );
  }

  try {
    const body = await request.json();
    const parsed = createDeliveryJobSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400, headers }
      );
    }

    if (auth && parsed.data.merchant_id !== auth.sub) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
    }

    // A payment transaction creates at most one delivery. A retry after a
    // timeout must return the existing job and its actual handoff codes.
    if (parsed.data.transaction_id) {
      const { data: existing, error: existingError } = await supabase
        .from("delivery_jobs").select("*")
        .eq("transaction_id", parsed.data.transaction_id).maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        if (existing.merchant_id !== parsed.data.merchant_id || existing.customer_id !== parsed.data.customer_id) {
          return NextResponse.json({ error: "Transaction delivery ownership mismatch" }, { status: 409, headers });
        }
        return NextResponse.json({ delivery: isServiceCall || shippingStaff ? existing : { ...existing, delivery_code: undefined }, job_number: existing.job_number,
          ...deliverySettlementReply(existing),
          pickup_code: existing.pickup_code,
          ...(isServiceCall || shippingStaff ? { delivery_code: existing.delivery_code } : {}) }, { headers });
      }
    }

    // Verify the configured company before creating a new paid-delivery job.
    // The caller freezes this beneficiary when quoting/charging the purchase.
    const settlement = parsed.data.shipping_fee > 0 ? await getShippingSettlement() : null;
    if (settlement) assertShippingSettlement(parsed.data.metadata.shipping_settlement, settlement);
    const deliveryMetadata: Record<string, unknown> = { ...parsed.data.metadata, shipping_settlement: settlement };
    if (!isServiceCall) {
      // A browser/staff-created job cannot certify a Peeap wallet posting.
      delete deliveryMetadata.shipping_fee_settled;
      delete deliveryMetadata.shipping_credit_transaction_id;
    }

    // Generate job number: SHP-YYYYMMDD-XXXXXX (6 crypto-random alphanumeric)
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const randomSuffix = randomBytes(4).toString("base64url").slice(0, 6).toUpperCase();
    const jobNumber = `SHP-${dateStr}-${randomSuffix}`;

    // Generate 6-digit verification codes
    const pickupCode = generateCode();
    const deliveryCode = generateCode();

    // Estimate delivery date (default: 3 days from now, or use preferred_date)
    const estimatedDate = parsed.data.preferred_date
      || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const jobData = {
      ...parsed.data,
      metadata: deliveryMetadata,
      job_number: jobNumber,
      status: "pending",
      pickup_code: pickupCode,
      delivery_code: deliveryCode,
      estimated_delivery_date: estimatedDate,
    };

    const { data, error } = await supabase
      .from("delivery_jobs")
      .insert(jobData)
      .select()
      .single();

    if (error) {
      if (error.code === "23505" && parsed.data.transaction_id) {
        const { data: existing } = await supabase.from("delivery_jobs").select("*")
          .eq("transaction_id", parsed.data.transaction_id).maybeSingle();
        if (existing && existing.merchant_id === parsed.data.merchant_id && existing.customer_id === parsed.data.customer_id) {
          return NextResponse.json({ delivery: isServiceCall || shippingStaff ? existing : { ...existing, delivery_code: undefined }, job_number: existing.job_number,
            ...deliverySettlementReply(existing),
            pickup_code: existing.pickup_code,
            ...(isServiceCall || shippingStaff ? { delivery_code: existing.delivery_code } : {}) }, { headers });
        }
      }
      throw error;
    }

    // Create initial tracking update
    await supabase.from("tracking_updates").insert({
      job_id: data.id,
      status: "pending",
      message: "Delivery job created. Awaiting driver assignment.",
      updated_by: auth?.sub || null,
    });

    // ── Send initial chat messages to buyer and vendor ──
    const meta = (parsed.data.metadata as Record<string, string>) || {};
    const storeId = meta.store_id || parsed.data.merchant_id;
    const storeName = meta.store_name || parsed.data.merchant_name || "Store";
    const NIL_UUID = "00000000-0000-0000-0000-000000000000";

    if (parsed.data.customer_id && parsed.data.customer_id !== NIL_UUID) {
      // Message to BUYER: "Shipping started, your delivery code is XXXX"
      const formattedDate = new Date(estimatedDate).toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric",
      });

      sendShippingUpdateToChat({
        job_number: jobNumber,
        store_id: storeId,
        store_name: storeName,
        buyer_user_id: parsed.data.customer_id,
        seller_user_id: parsed.data.merchant_id,
        new_status: "order_created",
        delivery_address: parsed.data.delivery_address,
      }).catch(() => {});

      // We'll use the ecommerce endpoint to also send the codes as rich_content
      // The buyer message is already handled above via "order_created" → seller↔buyer chat

      // Message to VENDOR: "Pickup scheduled, your pickup code is XXXX"
      // This goes to the same seller↔buyer conversation but we send a separate system message
      const CHAT_API = process.env.CHAT_API_URL || "https://chat.peeap.com";
      const MAIN_API = process.env.MAIN_API_URL || "https://api.peeap.com";
      const SERVICE_SECRET = process.env.SERVICE_SECRET || "";

      // Public shipping update in the buyer↔vendor chat (NO CODES — those are private)
      fetch(`${CHAT_API}/api/ecommerce/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Service-Secret": SERVICE_SECRET },
        body: JSON.stringify({
          order_id: jobNumber,
          store_id: storeId,
          buyer_user_id: parsed.data.customer_id,
          seller_user_id: parsed.data.merchant_id,
          category: "shipping_update",
          content: `Order from ${storeName} is being prepared for shipping.\nEstimated delivery: ${formattedDate}\nTrack: shipping.peeap.com/track/${jobNumber}\n\nCheck your notifications for your private handoff code.`,
          rich_content: {
            job_number: jobNumber,
            store_name: storeName,
            new_status: "shipping_started",
            estimated_delivery_date: estimatedDate,
            tracking_url: `https://shipping.peeap.com/track/${jobNumber}`,
          },
          tracking_number: jobNumber,
        }),
      }).catch(() => {});

      // Buyer PRIVATE delivery code via notification (not chat)
      fetch(`${MAIN_API}/api/notifications/internal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Service-Secret": SERVICE_SECRET },
        body: JSON.stringify({
          user_id: parsed.data.customer_id,
          type: "shipping_update",
          title: "Your delivery code",
          message: `Your private delivery code for order ${jobNumber} is ${deliveryCode}. Give this to the rider when they deliver your package.`,
          action_url: `/orders`,
          source_service: "shipping",
          priority: "high",
        }),
      }).catch(() => {});

      // Vendor PRIVATE pickup code via notification (not chat)
      // action_url must point to the POS vendor dashboard (store.peeap.com)
      // where the pickup code is actually displayed — NOT to my.peeap.com.
      fetch(`${MAIN_API}/api/notifications/internal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Service-Secret": SERVICE_SECRET },
        body: JSON.stringify({
          user_id: parsed.data.merchant_id,
          type: "shipping_update",
          title: "Your pickup code",
          message: `Your private pickup code for order ${meta.order_number || jobNumber} is ${pickupCode}. Give this to the rider when they arrive to collect the package.`,
          action_url: `https://store.peeap.com/dashboard/orders`,
          source_service: "shipping",
          priority: "high",
        }),
      }).catch(() => {});

      // ── SMS fallback for verification codes ──
      // Send pickup code to vendor via SMS
      if (parsed.data.metadata?.merchant_phone) {
        sendPickupCodeSms(parsed.data.metadata.merchant_phone, pickupCode, jobNumber);
      }
      // Send delivery code to buyer via SMS
      if (parsed.data.customer_phone) {
        const formattedDateSms = new Date(estimatedDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        sendDeliveryCodeSms(parsed.data.customer_phone, deliveryCode, storeName, formattedDateSms);
      }
    }

    // ── Auto-dispatch: find nearest driver immediately (fire-and-forget) ──
    const SELF_URL = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3500");
    const SERVICE_SECRET_VAL = process.env.SERVICE_SECRET || "";
    if (SERVICE_SECRET_VAL) {
      fetch(`${SELF_URL}/api/dispatch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Secret": SERVICE_SECRET_VAL,
        },
        body: JSON.stringify({ job_id: data.id }),
      }).then(async (r) => {
        if (r.ok) {
          const d = await r.json().catch(() => ({}));
          console.log(`[AutoDispatch] Job ${jobNumber} dispatched:`, d.message || "offered to driver");
        } else {
          console.warn(`[AutoDispatch] Job ${jobNumber} dispatch failed (${r.status}) — will need manual dispatch`);
        }
      }).catch((err) => {
        console.warn(`[AutoDispatch] Job ${jobNumber} dispatch error:`, err instanceof Error ? err.message : err);
      });
    }

    return NextResponse.json(
      { delivery: isServiceCall || shippingStaff ? data : { ...data, delivery_code: undefined }, job_number: jobNumber, pickup_code: pickupCode,
        ...(isServiceCall || shippingStaff ? { delivery_code: deliveryCode } : {}),
        ...deliverySettlementReply(data) },
      { status: 201, headers }
    );
  } catch (err) {
    if (err instanceof SettlementConfigError) {
      return NextResponse.json({ error: err.code, error_description: err.message }, { status: err.status, headers });
    }
    console.error("Error creating delivery job:", err);
    return NextResponse.json(
      { error: "Failed to create delivery job" },
      { status: 500, headers }
    );
  }
}
