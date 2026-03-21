import { NextRequest, NextResponse } from "next/server";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";

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

    let query = supabase
      .from("delivery_zones")
      .select("*")
      .eq("is_active", true)
      .order("city")
      .order("name");

    if (city) {
      query = query.ilike("city", `%${city}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ zones: data || [] }, { headers });
  } catch (err) {
    console.error("Error fetching zones:", err);
    return NextResponse.json(
      { error: "Failed to fetch zones" },
      { status: 500, headers }
    );
  }
}
