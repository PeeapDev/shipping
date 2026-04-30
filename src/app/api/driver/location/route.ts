import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { driverLocationSchema } from "@/lib/validation";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

// POST /api/driver/location — Update GPS position (called every 15-30s)
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const body = await request.json();
    const parsed = driverLocationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid location data", details: parsed.error.flatten() },
        { status: 400, headers }
      );
    }

    const { lat, lng } = parsed.data;
    const now = new Date().toISOString();

    // Update driver's location
    const { data: driver, error } = await supabase
      .from("drivers")
      .update({
        current_lat: lat,
        current_lng: lng,
        last_location_at: now,
        updated_at: now,
      })
      .eq("user_id", auth.sub)
      .eq("is_active", true)
      .select("id, active_job_id")
      .single();

    if (error || !driver) {
      return NextResponse.json({ error: "Driver not found" }, { status: 404, headers });
    }

    // If driver has an active job, also create a tracking update (throttled: max 1/min)
    if (driver.active_job_id) {
      const oneMinAgo = new Date(Date.now() - 60_000).toISOString();

      const { count } = await supabase
        .from("tracking_updates")
        .select("id", { count: "exact", head: true })
        .eq("job_id", driver.active_job_id)
        .eq("status", "location_update")
        .gte("created_at", oneMinAgo);

      if (!count || count === 0) {
        await supabase.from("tracking_updates").insert({
          job_id: driver.active_job_id,
          status: "location_update",
          message: "Driver location updated",
          location_lat: lat,
          location_lng: lng,
          updated_by: auth.sub,
        });
      }
    }

    return NextResponse.json({ ok: true }, { headers });
  } catch (err) {
    console.error("Error updating location:", err);
    return NextResponse.json({ error: "Failed to update location" }, { status: 500, headers });
  }
}
