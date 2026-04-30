import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { authenticateShippingRequest } from "@/lib/shipping-auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { requirePermission, auditLog } from "@/lib/rbac";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

/**
 * GET /api/disputes — List disputes (staff: all, user: own)
 */
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const shippingAuth = authenticateShippingRequest(request);
  const auth = shippingAuth || await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "open";
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

    let query = supabase
      .from("disputes")
      .select("*, delivery:delivery_jobs(id, job_number, customer_name, merchant_name, status, shipping_fee)")
      .order("created_at", { ascending: false })
      .limit(limit);

    // Staff see all, users see only their own
    if (!shippingAuth) {
      query = query.eq("opened_by", auth.sub);
    }

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ disputes: data || [] }, { headers });
  } catch (err) {
    console.error("Error fetching disputes:", err);
    return NextResponse.json({ error: "Failed to fetch disputes" }, { status: 500, headers });
  }
}

/**
 * POST /api/disputes — Open a new dispute (customer or merchant)
 * Body: { job_id, type, description }
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const body = await request.json();
    const { job_id, type, description } = body;

    if (!job_id || !type || !description) {
      return NextResponse.json({ error: "job_id, type, and description required" }, { status: 400, headers });
    }

    const validTypes = ["not_received", "wrong_item", "damaged", "late_delivery", "overcharged", "other"];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `Invalid type. Must be: ${validTypes.join(", ")}` }, { status: 400, headers });
    }

    // Verify the delivery exists and user is involved
    const { data: delivery } = await supabase
      .from("delivery_jobs")
      .select("id, customer_id, merchant_id, status")
      .eq("id", job_id)
      .single();

    if (!delivery) {
      return NextResponse.json({ error: "Delivery not found" }, { status: 404, headers });
    }

    if (delivery.customer_id !== auth.sub && delivery.merchant_id !== auth.sub) {
      return NextResponse.json({ error: "You are not involved in this delivery" }, { status: 403, headers });
    }

    // Must be delivered/completed to dispute
    if (!["delivered", "completed"].includes(delivery.status)) {
      return NextResponse.json({ error: "Can only dispute completed deliveries" }, { status: 400, headers });
    }

    // Check for existing open dispute
    const { data: existing } = await supabase
      .from("disputes")
      .select("id")
      .eq("job_id", job_id)
      .in("status", ["open", "investigating"])
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "A dispute is already open for this delivery" }, { status: 400, headers });
    }

    const { data: dispute, error: createError } = await supabase
      .from("disputes")
      .insert({
        job_id,
        opened_by: auth.sub,
        type,
        description,
        status: "open",
        priority: type === "not_received" ? "high" : "normal",
      })
      .select()
      .single();

    if (createError) throw createError;

    return NextResponse.json({ dispute }, { status: 201, headers });
  } catch (err) {
    console.error("Error creating dispute:", err);
    return NextResponse.json({ error: "Failed to create dispute" }, { status: 500, headers });
  }
}

/**
 * PUT /api/disputes — Update dispute status (staff only)
 * Body: { dispute_id, status, resolution_notes?, refund_amount? }
 */
export async function PUT(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = authenticateShippingRequest(request);
  const rbacError = requirePermission(auth, "resolve_disputes", headers);
  if (rbacError) return rbacError;

  try {
    const body = await request.json();
    const { dispute_id, status, resolution_notes, refund_amount } = body;

    if (!dispute_id || !status) {
      return NextResponse.json({ error: "dispute_id and status required" }, { status: 400, headers });
    }

    const validStatuses = ["investigating", "resolved_refund", "resolved_no_action", "resolved_warning", "closed"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be: ${validStatuses.join(", ")}` }, { status: 400, headers });
    }

    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === "investigating") {
      updateData.assigned_to = auth!.sub;
    }

    if (status.startsWith("resolved") || status === "closed") {
      updateData.resolved_at = new Date().toISOString();
      if (resolution_notes) updateData.resolution_notes = resolution_notes;
    }

    if (status === "resolved_refund" && refund_amount && refund_amount > 0) {
      updateData.refund_amount = refund_amount;

      // Get the delivery to find the customer
      const { data: dispute } = await supabase
        .from("disputes")
        .select("job_id")
        .eq("id", dispute_id)
        .single();

      if (dispute) {
        const { data: delivery } = await supabase
          .from("delivery_jobs")
          .select("customer_id, job_number")
          .eq("id", dispute.job_id)
          .single();

        if (delivery) {
          // Process refund to customer wallet
          const MAIN_API = process.env.MAIN_API_URL || "https://api.peeap.com";
          const SERVICE_SECRET = process.env.SERVICE_SECRET || "";
          fetch(`${MAIN_API}/api/wallets/credit`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Service-Secret": SERVICE_SECRET,
            },
            body: JSON.stringify({
              user_id: delivery.customer_id,
              amount: refund_amount,
              description: `Dispute refund - ${delivery.job_number}`,
              reference: `dispute_refund_${dispute_id}`,
              source: "shipping_dispute",
            }),
          }).catch(() => {});

          // Record in fee_transactions
          await supabase.from("fee_transactions").insert({
            job_id: dispute.job_id,
            type: "shipping_fee_refund",
            amount: refund_amount,
            from_party: "platform",
            to_party: "customer",
            status: "completed",
            reference: dispute_id,
            description: `Dispute refund: ${resolution_notes || "resolved"}`,
          });
        }
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from("disputes")
      .update(updateData)
      .eq("id", dispute_id)
      .select()
      .single();

    if (updateError) throw updateError;

    auditLog({
      actorId: auth!.sub, actorEmail: auth!.email, actorRole: auth!.role,
      action: `dispute_${status}`, resourceType: "dispute", resourceId: dispute_id,
      details: { resolution_notes, refund_amount },
    });

    return NextResponse.json({ dispute: updated }, { headers });
  } catch (err) {
    console.error("Error updating dispute:", err);
    return NextResponse.json({ error: "Failed to update dispute" }, { status: 500, headers });
  }
}
