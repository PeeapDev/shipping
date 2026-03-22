import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { z } from "zod";

const applySchema = z.object({
  name: z.string().min(1).max(255),
  phone: z.string().min(1).max(50),
  email: z.string().email().max(255).optional(),
  city: z.string().min(1).max(100),
  vehicle_type: z.enum(["motorcycle", "car", "bicycle", "foot"]).default("motorcycle"),
  vehicle_plate: z.string().max(50).optional(),
  experience_years: z.number().int().min(0).max(50).default(0),
  bio: z.string().max(2000).optional(),
  available_hours: z.enum(["full_time", "part_time", "weekends"]).default("full_time"),
  id_card_url: z.string().url().optional(),
  drivers_license_url: z.string().url().optional(),
  vehicle_photo_url: z.string().url().optional(),
  profile_photo_url: z.string().url().optional(),
  cv_url: z.string().url().optional(),
});

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

// GET /api/apply — Check application status (authenticated)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const { data, error } = await supabase
      .from("driver_applications")
      .select("*")
      .eq("user_id", auth.sub)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    return NextResponse.json({ application: data || null }, { headers });
  } catch (err) {
    console.error("Error fetching application:", err);
    return NextResponse.json(
      { error: "Failed to fetch application" },
      { status: 500, headers }
    );
  }
}

// POST /api/apply — Submit driver application (authenticated Peeap user)
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    // Check if user already has a pending/approved application
    const { data: existing } = await supabase
      .from("driver_applications")
      .select("id, status")
      .eq("user_id", auth.sub)
      .in("status", ["pending", "under_review", "approved"])
      .limit(1);

    if (existing && existing.length > 0) {
      const app = existing[0];
      if (app.status === "approved") {
        return NextResponse.json(
          { error: "You are already an approved driver" },
          { status: 409, headers }
        );
      }
      return NextResponse.json(
        { error: "You already have a pending application", application_id: app.id },
        { status: 409, headers }
      );
    }

    // Also check if already registered as a driver
    const { data: existingDriver } = await supabase
      .from("drivers")
      .select("id")
      .eq("user_id", auth.sub)
      .limit(1);

    if (existingDriver && existingDriver.length > 0) {
      return NextResponse.json(
        { error: "You are already registered as a driver" },
        { status: 409, headers }
      );
    }

    const body = await request.json();
    const parsed = applySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400, headers }
      );
    }

    const { data, error } = await supabase
      .from("driver_applications")
      .insert({
        ...parsed.data,
        user_id: auth.sub,
        status: "pending",
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(
      { application: data, message: "Application submitted successfully" },
      { status: 201, headers }
    );
  } catch (err) {
    console.error("Error submitting application:", err);
    return NextResponse.json(
      { error: "Failed to submit application" },
      { status: 500, headers }
    );
  }
}
