import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

// GET /api/staff — List staff members (authenticated)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const { data, error } = await supabase
      .from("shipping_staff")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ staff: data || [] }, { headers });
  } catch (err) {
    console.error("Error fetching staff:", err);
    return NextResponse.json(
      { error: "Failed to fetch staff" },
      { status: 500, headers }
    );
  }
}

// POST /api/staff — Add staff member (authenticated)
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const body = await request.json();
    const { name, email, phone, role } = body;

    if (!name || !role) {
      return NextResponse.json(
        { error: "Name and role are required" },
        { status: 400, headers }
      );
    }

    const validRoles = ["dispatcher", "manager", "admin"];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${validRoles.join(", ")}` },
        { status: 400, headers }
      );
    }

    const { data, error } = await supabase
      .from("shipping_staff")
      .insert({
        user_id: auth.sub,
        name,
        email: email || null,
        phone: phone || null,
        role,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ staff: data }, { status: 201, headers });
  } catch (err) {
    console.error("Error adding staff:", err);
    return NextResponse.json(
      { error: "Failed to add staff member" },
      { status: 500, headers }
    );
  }
}

// PUT /api/staff — Update staff member (authenticated)
export async function PUT(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Staff ID is required" },
        { status: 400, headers }
      );
    }

    const { data, error } = await supabase
      .from("shipping_staff")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ staff: data }, { headers });
  } catch (err) {
    console.error("Error updating staff:", err);
    return NextResponse.json(
      { error: "Failed to update staff member" },
      { status: 500, headers }
    );
  }
}
