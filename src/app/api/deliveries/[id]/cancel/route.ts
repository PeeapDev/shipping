import { NextRequest, NextResponse } from "next/server";
import { authenticateShippingRequest } from "@/lib/shipping-auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { notifyStatusChange } from "@/lib/status-webhook";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const shippingAuth = authenticateShippingRequest(request);
  if (!shippingAuth) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { reason, cancelled_by, merchant_id } = body;

    const { data: existing, error: fetchError } = await supabase
      .from("delivery_jobs")
      .select("id, merchant_id, status, job_number, customer_id, driver_id, metadata")
      .eq("id", params.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Delivery not found" },
        { status: 404, headers }
      );
    }

    const terminalStates = ["delivered", "completed", "cancelled", "returned"];
    if (terminalStates.includes(existing.status)) {
      return NextResponse.json(
        { error: `Cannot cancel delivery in '${existing.status}' status` },
        { status: 400, headers }
      );
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("delivery_jobs")
      .update({
        status: "cancelled",
        cancel_reason: reason || "",
        cancelled_at: now,
        cancelled_by: cancelled_by || "merchant",
        updated_at: now,
      })
      .eq("id", params.id)
      .select()
      .single();

    if (updateError) throw updateError;

    await supabase.from("tracking_updates").insert({
      job_id: params.id,
      status: "cancelled",
      message: reason
        ? `Delivery cancelled: ${reason}`
        : "Delivery cancelled by merchant.",
      updated_by: shippingAuth.sub,
    });

    if (reason) {
      await supabase.from("tracking_updates").insert({
        job_id: params.id,
        status: "cancelled",
        message: `Reason: ${reason}`,
        updated_by: shippingAuth.sub,
      });
    }

    // Free up the driver if one was assigned
    if (existing.driver_id) {
      await supabase
        .from("drivers")
        .update({ active_job_id: null, is_available: true, updated_at: now })
        .eq("id", existing.driver_id);
    }

    // Notify main API
    notifyStatusChange({
      job_number: existing.job_number,
      store_order_id: (existing.metadata as Record<string, string>)?.order_number,
      new_status: "cancelled",
    });

    return NextResponse.json(
      { cancelled: true, job_number: existing.job_number, status: "cancelled", delivery: updated },
      { headers }
    );
  } catch (err) {
    console.error("Error cancelling delivery:", err);
    return NextResponse.json(
      { error: "Failed to cancel delivery" },
      { status: 500, headers }
    );
  }
}
