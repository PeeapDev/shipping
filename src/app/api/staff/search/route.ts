import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateShippingRequest } from "@/lib/shipping-auth";
import { corsHeaders, handleCORS } from "@/lib/cors";

// Main Peeap Supabase for user lookup
const MAIN_SUPABASE_URL =
  process.env.MAIN_SUPABASE_URL || "https://akiecgwcxadcpqlvntmf.supabase.co";
const MAIN_SUPABASE_KEY =
  process.env.MAIN_SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "";

function getMainSupabase() {
  return createClient(MAIN_SUPABASE_URL, MAIN_SUPABASE_KEY, {
    auth: { persistSession: false },
  });
}

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

// GET /api/staff/search?q=... — Search Peeap users by name, phone, or email
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  // Accept shipping tokens
  const auth = authenticateShippingRequest(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";

    if (!q.trim() || q.trim().length < 2) {
      return NextResponse.json(
        { error: "Search query must be at least 2 characters" },
        { status: 400, headers }
      );
    }

    const mainDb = getMainSupabase();
    const query = q.trim().toLowerCase();

    // Search users by email, phone, or name in main Peeap DB
    const { data: users, error } = await mainDb
      .from("users")
      .select(
        "id, email, phone, first_name, last_name, profile_picture"
      )
      .or(
        `email.ilike.%${query}%,phone.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%`
      )
      .limit(10);

    if (error) {
      console.error("[StaffSearch] DB error:", error);
      return NextResponse.json(
        { error: "Failed to search users" },
        { status: 500, headers }
      );
    }

    // Format results
    const formatted = (users || []).map((u: any) => ({
      id: u.id,
      firstName: u.first_name || "",
      lastName: u.last_name || "",
      fullName:
        [u.first_name, u.last_name].filter(Boolean).join(" ") ||
        u.email ||
        "Unknown",
      email: u.email || null,
      phone: u.phone || null,
      avatarUrl: u.profile_picture || null,
    }));

    return NextResponse.json({ users: formatted }, { headers });
  } catch (err) {
    console.error("[StaffSearch] Error:", err);
    return NextResponse.json(
      { error: "Failed to search users" },
      { status: 500, headers }
    );
  }
}
