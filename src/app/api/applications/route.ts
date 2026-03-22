import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

// GET /api/applications — List all driver applications (admin/staff)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending";
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

    let query = supabase
      .from("driver_applications")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json(
      { applications: data || [], total: count || 0 },
      { headers }
    );
  } catch (err) {
    console.error("Error fetching applications:", err);
    return NextResponse.json(
      { error: "Failed to fetch applications" },
      { status: 500, headers }
    );
  }
}

// PUT /api/applications — Approve or reject an application (admin/staff)
export async function PUT(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const body = await request.json();
    const { application_id, action, rejection_reason } = body;

    if (!application_id || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "application_id and action (approve/reject) required" },
        { status: 400, headers }
      );
    }

    // Get the application
    const { data: app, error: fetchError } = await supabase
      .from("driver_applications")
      .select("*")
      .eq("id", application_id)
      .single();

    if (fetchError || !app) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404, headers }
      );
    }

    if (app.status !== "pending" && app.status !== "under_review") {
      return NextResponse.json(
        { error: `Application already ${app.status}` },
        { status: 400, headers }
      );
    }

    if (action === "approve") {
      // Create the driver record from the application
      const { error: driverError } = await supabase
        .from("drivers")
        .insert({
          user_id: app.user_id,
          name: app.name,
          phone: app.phone,
          email: app.email,
          vehicle_type: app.vehicle_type,
          vehicle_plate: app.vehicle_plate,
          profile_picture: app.profile_photo_url,
          city: app.city,
          is_active: true,
          is_available: true,
        });

      if (driverError) throw driverError;

      // Update application status
      await supabase
        .from("driver_applications")
        .update({
          status: "approved",
          reviewed_by: auth.sub,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", application_id);

      return NextResponse.json(
        { message: "Application approved. Driver account created.", status: "approved" },
        { headers }
      );
    } else {
      // Reject
      await supabase
        .from("driver_applications")
        .update({
          status: "rejected",
          rejection_reason: rejection_reason || "Application did not meet requirements",
          reviewed_by: auth.sub,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", application_id);

      return NextResponse.json(
        { message: "Application rejected.", status: "rejected" },
        { headers }
      );
    }
  } catch (err) {
    console.error("Error reviewing application:", err);
    return NextResponse.json(
      { error: "Failed to review application" },
      { status: 500, headers }
    );
  }
}
