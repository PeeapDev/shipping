import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { corsHeaders, handleCORS } from "@/lib/cors";

const PEEAP_API_URL = process.env.API_BASE_URL || "https://api.peeap.com";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

// GET /api/staff/search?q=... — Search Peeap users by name, phone, or email
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
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

    // Call the main Peeap API to search users
    const res = await fetch(
      `${PEEAP_API_URL}/api/users/search?q=${encodeURIComponent(q.trim())}&limit=10`
    );

    if (!res.ok) {
      console.error("[StaffSearch] Peeap API error:", res.status);
      return NextResponse.json(
        { error: "Failed to search users" },
        { status: 502, headers }
      );
    }

    const data = await res.json();

    // Format results consistently
    const users = (data.users || []).map((u: any) => ({
      id: u.id,
      firstName: u.first_name || u.firstName || "",
      lastName: u.last_name || u.lastName || "",
      fullName:
        [u.first_name || u.firstName, u.last_name || u.lastName]
          .filter(Boolean)
          .join(" ") || u.email || "Unknown",
      email: u.email || null,
      phone: u.phone || null,
      avatarUrl: u.avatar_url || u.profile_picture || u.avatarUrl || null,
    }));

    return NextResponse.json({ users }, { headers });
  } catch (err) {
    console.error("[StaffSearch] Error:", err);
    return NextResponse.json(
      { error: "Failed to search users" },
      { status: 500, headers }
    );
  }
}
