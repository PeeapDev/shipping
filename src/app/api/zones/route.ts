import { NextRequest, NextResponse } from "next/server";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { authenticateRequest, authenticateServiceCall } from "@/lib/auth";
import { authenticateShippingRequest } from "@/lib/shipping-auth";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

// GET /api/zones — Get delivery zones and pricing (public)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get("city");
    const includeInactive = searchParams.get("all") === "true";

    let query = supabase
      .from("delivery_zones")
      .select("*")
      .order("city")
      .order("name");

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    if (city) {
      query = query.ilike("city", `%${city}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ zones: data || [] }, { headers });
  } catch (err: any) {
    console.error("Error fetching zones:", err);
    return NextResponse.json(
      { error: "Failed to fetch zones", detail: err?.message || String(err) },
      { status: 500, headers }
    );
  }
}

// POST /api/zones — Create a new delivery zone (auth required)
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const user = authenticateShippingRequest(request) || await authenticateRequest(request);
  const isService = authenticateServiceCall(request);
  if (!user && !isService) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const body = await request.json();
    const { name, city, base_fee, per_km_fee, min_fee, max_fee, estimated_time_minutes, is_active } = body;

    if (!name || !city) {
      return NextResponse.json({ error: "name and city are required" }, { status: 400, headers });
    }

    const { data, error } = await supabase
      .from("delivery_zones")
      .insert({
        name,
        city,
        base_fee: base_fee ?? 10,
        per_km_fee: per_km_fee ?? 2,
        min_fee: min_fee ?? 5,
        max_fee: max_fee ?? 100,
        estimated_time_minutes: estimated_time_minutes ?? 60,
        is_active: is_active ?? true,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ zone: data }, { status: 201, headers });
  } catch (err: any) {
    console.error("Error creating zone:", err);
    return NextResponse.json(
      { error: "Failed to create zone", detail: err?.message || String(err) },
      { status: 500, headers }
    );
  }
}

// PUT /api/zones — Update a delivery zone (auth required)
export async function PUT(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const user = authenticateShippingRequest(request) || await authenticateRequest(request);
  const isService = authenticateServiceCall(request);
  if (!user && !isService) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400, headers });
    }

    // Only allow valid fields
    const allowed = ["name", "city", "base_fee", "per_km_fee", "min_fee", "max_fee", "estimated_time_minutes", "is_active"];
    const filtered: Record<string, any> = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) filtered[key] = updates[key];
    }

    const { data, error } = await supabase
      .from("delivery_zones")
      .update(filtered)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ zone: data }, { headers });
  } catch (err: any) {
    console.error("Error updating zone:", err);
    return NextResponse.json(
      { error: "Failed to update zone", detail: err?.message || String(err) },
      { status: 500, headers }
    );
  }
}

// DELETE /api/zones — Delete a delivery zone (auth required)
export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const user = authenticateShippingRequest(request) || await authenticateRequest(request);
  const isService = authenticateServiceCall(request);
  if (!user && !isService) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400, headers });
    }

    const { error } = await supabase
      .from("delivery_zones")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true }, { headers });
  } catch (err: any) {
    console.error("Error deleting zone:", err);
    return NextResponse.json(
      { error: "Failed to delete zone", detail: err?.message || String(err) },
      { status: 500, headers }
    );
  }
}
