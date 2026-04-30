import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { authenticateShippingRequest } from "@/lib/shipping-auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { registerDriverSchema, updateDriverSchema } from "@/lib/validation";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

// GET /api/drivers — List drivers (admin: all, public: available count)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = authenticateShippingRequest(request) || await authenticateRequest(request);

  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get("city");
    const available = searchParams.get("available");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const offset = parseInt(searchParams.get("offset") || "0");

    // If not authenticated, return only summary counts
    if (!auth) {
      const { count } = await supabase
        .from("drivers")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("is_available", true);

      return NextResponse.json(
        { available_drivers: count || 0 },
        { headers }
      );
    }

    let query = supabase
      .from("drivers")
      .select("*", { count: "exact" })
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (available === "true") {
      query = query.eq("is_available", true);
    }
    if (city) {
      query = query.ilike("city", `%${city}%`);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json(
      { drivers: data || [], total: count || 0 },
      { headers }
    );
  } catch (err) {
    console.error("Error fetching drivers:", err);
    return NextResponse.json(
      { error: "Failed to fetch drivers" },
      { status: 500, headers }
    );
  }
}

// POST /api/drivers — Register as driver (auth required)
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers }
    );
  }

  try {
    // Check if user is already registered as a driver
    const { data: existing } = await supabase
      .from("drivers")
      .select("id")
      .eq("user_id", auth.sub)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "Already registered as a driver" },
        { status: 409, headers }
      );
    }

    const body = await request.json();
    const parsed = registerDriverSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400, headers }
      );
    }

    const { data, error } = await supabase
      .from("drivers")
      .insert({
        ...parsed.data,
        user_id: auth.sub,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ driver: data }, { status: 201, headers });
  } catch (err) {
    console.error("Error registering driver:", err);
    return NextResponse.json(
      { error: "Failed to register driver" },
      { status: 500, headers }
    );
  }
}

// PUT /api/drivers — Update driver profile/availability (auth required)
export async function PUT(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers }
    );
  }

  try {
    const body = await request.json();
    const parsed = updateDriverSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400, headers }
      );
    }

    const { data, error } = await supabase
      .from("drivers")
      .update({
        ...parsed.data,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", auth.sub)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { error: "Driver profile not found" },
        { status: 404, headers }
      );
    }

    return NextResponse.json({ driver: data }, { headers });
  } catch (err) {
    console.error("Error updating driver:", err);
    return NextResponse.json(
      { error: "Failed to update driver" },
      { status: 500, headers }
    );
  }
}
