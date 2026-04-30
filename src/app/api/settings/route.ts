import { NextRequest, NextResponse } from "next/server";
import { authenticateShippingRequest } from "@/lib/shipping-auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { requirePermission, auditLog } from "@/lib/rbac";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

// GET /api/settings — Fetch all shipping settings
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = authenticateShippingRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const { data, error } = await supabase
      .from("shipping_settings")
      .select("key, value, description");

    if (error) throw error;

    // Convert array of { key, value } to a flat object
    const settings: Record<string, any> = {};
    for (const row of data || []) {
      settings[row.key] = row.value;
    }

    return NextResponse.json({ settings }, { headers });
  } catch (err) {
    console.error("Error fetching settings:", err);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500, headers });
  }
}

// PUT /api/settings — Update one or more settings
export async function PUT(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = authenticateShippingRequest(request);
  const rbacError = requirePermission(auth, "manage_settings", headers);
  if (rbacError) return rbacError;

  try {
    const body = await request.json();
    const { settings } = body;

    if (!settings || typeof settings !== "object") {
      return NextResponse.json({ error: "Settings object required" }, { status: 400, headers });
    }

    const now = new Date().toISOString();

    for (const [key, value] of Object.entries(settings)) {
      await supabase
        .from("shipping_settings")
        .upsert({ key, value: JSON.stringify(value), updated_at: now }, { onConflict: "key" });
    }

    return NextResponse.json({ message: "Settings updated" }, { headers });
  } catch (err) {
    console.error("Error updating settings:", err);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500, headers });
  }
}
