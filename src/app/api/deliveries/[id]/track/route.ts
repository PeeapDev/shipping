import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { authenticateShippingRequest } from "@/lib/shipping-auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { addTrackingUpdateSchema } from "@/lib/validation";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

// GET /api/deliveries/[id]/track — Public tracking by job_number (no auth needed)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    // The "id" param can be either a UUID or a job_number
    const identifier = params.id;

    // Try as UUID first, then as job_number
    let delivery;
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        identifier
      );

    if (isUUID) {
      const { data, error } = await supabase
        .from("delivery_jobs")
        .select(
          "id, job_number, status, customer_name, pickup_city, delivery_city, delivery_address, package_size, package_description, estimated_delivery_time, actual_delivery_time, created_at, estimated_delivery_date, driver:drivers!delivery_jobs_driver_id_fkey(id, name, phone, vehicle_type, profile_picture)"
        )
        .eq("id", identifier)
        .single();

      if (error) throw error;
      delivery = data;
    } else {
      const { data, error } = await supabase
        .from("delivery_jobs")
        .select(
          "id, job_number, status, customer_name, pickup_city, delivery_city, delivery_address, package_size, package_description, estimated_delivery_time, actual_delivery_time, created_at, estimated_delivery_date, driver:drivers!delivery_jobs_driver_id_fkey(id, name, phone, vehicle_type, profile_picture)"
        )
        .eq("job_number", identifier)
        .single();

      if (error) throw error;
      delivery = data;
    }

    if (!delivery) {
      return NextResponse.json(
        { error: "Delivery not found" },
        { status: 404, headers }
      );
    }

    // Get tracking updates
    const { data: updates } = await supabase
      .from("tracking_updates")
      .select("*")
      .eq("job_id", delivery.id)
      .order("created_at", { ascending: true });

    return NextResponse.json(
      {
        delivery,
        tracking: updates || [],
      },
      { headers }
    );
  } catch (err) {
    console.error("Error fetching tracking:", err);
    return NextResponse.json(
      { error: "Delivery not found" },
      { status: 404, headers }
    );
  }
}

// POST /api/deliveries/[id]/track — Add tracking update (driver auth)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = authenticateShippingRequest(request) || await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers }
    );
  }

  try {
    const body = await request.json();
    const parsed = addTrackingUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400, headers }
      );
    }

    // Verify the delivery exists and the user is the assigned driver
    const { data: delivery, error: fetchError } = await supabase
      .from("delivery_jobs")
      .select("id, driver_id, merchant_id")
      .eq("id", params.id)
      .single();

    if (fetchError || !delivery) {
      return NextResponse.json(
        { error: "Delivery not found" },
        { status: 404, headers }
      );
    }

    // Check if user is driver or merchant
    let authorized = delivery.merchant_id === auth.sub;
    if (!authorized && delivery.driver_id) {
      const { data: driverRecord } = await supabase
        .from("drivers")
        .select("id")
        .eq("id", delivery.driver_id)
        .eq("user_id", auth.sub)
        .single();
      authorized = !!driverRecord;
    }

    if (!authorized) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403, headers }
      );
    }

    const { data: trackingUpdate, error: insertError } = await supabase
      .from("tracking_updates")
      .insert({
        job_id: params.id,
        status: parsed.data.status,
        message: parsed.data.message,
        location_lat: parsed.data.location_lat,
        location_lng: parsed.data.location_lng,
        location_name: parsed.data.location_name,
        updated_by: auth.sub,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return NextResponse.json(
      { tracking_update: trackingUpdate },
      { status: 201, headers }
    );
  } catch (err) {
    console.error("Error adding tracking update:", err);
    return NextResponse.json(
      { error: "Failed to add tracking update" },
      { status: 500, headers }
    );
  }
}
