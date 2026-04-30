import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { rateDeliverySchema } from "@/lib/validation";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

// POST /api/deliveries/[id]/rate — Customer rates the driver
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
    const parsed = rateDeliverySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid rating data", details: parsed.error.flatten() },
        { status: 400, headers }
      );
    }

    // Fetch delivery
    const { data: delivery } = await supabase
      .from("delivery_jobs")
      .select("id, customer_id, driver_id, status, rated")
      .eq("id", params.id)
      .single();

    if (!delivery) {
      return NextResponse.json({ error: "Delivery not found" }, { status: 404, headers });
    }

    // Only the customer can rate
    if (delivery.customer_id !== auth.sub) {
      return NextResponse.json({ error: "Only the customer can rate this delivery" }, { status: 403, headers });
    }

    // Must be completed
    if (!["delivered", "completed"].includes(delivery.status)) {
      return NextResponse.json({ error: "Delivery must be completed before rating" }, { status: 400, headers });
    }

    // Can't rate twice
    if (delivery.rated) {
      return NextResponse.json({ error: "This delivery has already been rated" }, { status: 400, headers });
    }

    if (!delivery.driver_id) {
      return NextResponse.json({ error: "No driver assigned to this delivery" }, { status: 400, headers });
    }

    // Insert rating
    const { data: rating, error: ratingError } = await supabase
      .from("driver_ratings")
      .insert({
        job_id: params.id,
        driver_id: delivery.driver_id,
        customer_id: auth.sub,
        rating: parsed.data.rating,
        comment: parsed.data.comment || null,
      })
      .select()
      .single();

    if (ratingError) {
      if (ratingError.code === "23505") {
        return NextResponse.json({ error: "Already rated" }, { status: 400, headers });
      }
      throw ratingError;
    }

    // Mark delivery as rated
    await supabase
      .from("delivery_jobs")
      .update({ rated: true })
      .eq("id", params.id);

    // The trigger will auto-update the driver's average_rating

    return NextResponse.json({ rating }, { status: 201, headers });
  } catch (err) {
    console.error("Error rating delivery:", err);
    return NextResponse.json({ error: "Failed to rate delivery" }, { status: 500, headers });
  }
}
