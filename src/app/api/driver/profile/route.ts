import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { driverOnlineSchema } from "@/lib/validation";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

// GET /api/driver/profile — Get driver's own profile + stats
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const { data: driver, error } = await supabase
      .from("drivers")
      .select("*, active_job:delivery_jobs!drivers_active_job_id_fkey(*)")
      .eq("user_id", auth.sub)
      .maybeSingle();

    if (error) throw error;
    if (!driver) {
      return NextResponse.json({ error: "Driver profile not found" }, { status: 404, headers });
    }

    // Get today's earnings
    const today = new Date().toISOString().slice(0, 10);
    const { data: todayEarnings } = await supabase
      .from("driver_payouts")
      .select("amount")
      .eq("driver_id", driver.id)
      .eq("type", "earning")
      .gte("created_at", `${today}T00:00:00.000Z`);

    const todayTotal = (todayEarnings || []).reduce(
      (sum, p) => sum + (parseFloat(String(p.amount)) || 0),
      0
    );

    // Get today's completed deliveries count
    const { count: todayDeliveries } = await supabase
      .from("delivery_jobs")
      .select("id", { count: "exact", head: true })
      .eq("driver_id", driver.id)
      .eq("status", "completed")
      .gte("actual_delivery_time", `${today}T00:00:00.000Z`);

    return NextResponse.json({
      driver,
      stats: {
        today_earnings: todayTotal,
        today_deliveries: todayDeliveries || 0,
      },
    }, { headers });
  } catch (err) {
    console.error("Error fetching driver profile:", err);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500, headers });
  }
}

// PUT /api/driver/profile — Update online status or profile fields
export async function PUT(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const body = await request.json();

    // Find driver record
    const { data: driver } = await supabase
      .from("drivers")
      .select("id, active_job_id")
      .eq("user_id", auth.sub)
      .single();

    if (!driver) {
      return NextResponse.json({ error: "Driver profile not found" }, { status: 404, headers });
    }

    // Handle online/offline toggle
    if ("is_online" in body) {
      const parsed = driverOnlineSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid data" }, { status: 400, headers });
      }

      // Can't go offline with an active job
      if (!parsed.data.is_online && driver.active_job_id) {
        return NextResponse.json(
          { error: "Cannot go offline while you have an active delivery" },
          { status: 400, headers }
        );
      }

      const { data: updated, error } = await supabase
        .from("drivers")
        .update({
          is_online: parsed.data.is_online,
          is_available: parsed.data.is_online,
          updated_at: new Date().toISOString(),
        })
        .eq("id", driver.id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ driver: updated }, { headers });
    }

    // General profile update
    const allowedFields = [
      "name", "phone", "email", "vehicle_type", "vehicle_plate",
      "profile_picture", "city", "fcm_token",
    ];
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
      if (body[field] !== undefined) updateData[field] = body[field];
    }

    const { data: updated, error } = await supabase
      .from("drivers")
      .update(updateData)
      .eq("id", driver.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ driver: updated }, { headers });
  } catch (err) {
    console.error("Error updating driver profile:", err);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500, headers });
  }
}
