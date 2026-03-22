import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";

const PEEAP_API_URL = process.env.API_BASE_URL || "https://api.peeap.com";

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

// POST /api/staff — Add a Peeap user as staff member
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const body = await request.json();
    const { user_id, role } = body;

    if (!user_id || !role) {
      return NextResponse.json(
        { error: "user_id and role are required" },
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

    // Check if this user is already staff
    const { data: existing } = await supabase
      .from("shipping_staff")
      .select("id, is_active")
      .eq("user_id", user_id)
      .limit(1);

    if (existing && existing.length > 0) {
      if (existing[0].is_active) {
        return NextResponse.json(
          { error: "This user is already a staff member" },
          { status: 409, headers }
        );
      }
      // Reactivate if previously deactivated
      const { data: reactivated, error: reactivateError } = await supabase
        .from("shipping_staff")
        .update({ is_active: true, role, updated_at: new Date().toISOString() })
        .eq("id", existing[0].id)
        .select()
        .single();

      if (reactivateError) throw reactivateError;
      return NextResponse.json({ staff: reactivated }, { status: 200, headers });
    }

    // Fetch the user's profile from Peeap API to store name/email/phone
    let name = "Unknown User";
    let email: string | null = null;
    let phone: string | null = null;

    try {
      const profileRes = await fetch(
        `${PEEAP_API_URL}/api/users/search?q=${encodeURIComponent(user_id)}&limit=1`
      );
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        const users = profileData.users || [];
        const user = users.find((u: any) => u.id === user_id);
        if (user) {
          name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email || "Unknown User";
          email = user.email || null;
          phone = user.phone || null;
        }
      }
    } catch (profileErr) {
      console.error("[StaffAdd] Failed to fetch user profile:", profileErr);
      // Continue with the info from the request body as fallback
    }

    // Also accept name/email/phone from frontend as fallback (from search results)
    const finalName = body.name || name;
    const finalEmail = body.email || email;
    const finalPhone = body.phone || phone;

    const { data, error } = await supabase
      .from("shipping_staff")
      .insert({
        user_id,
        name: finalName,
        email: finalEmail,
        phone: finalPhone,
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
