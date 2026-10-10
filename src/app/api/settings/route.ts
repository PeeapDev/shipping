import { NextRequest, NextResponse } from "next/server";
import { authenticateShippingRequest } from "@/lib/shipping-auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { auditLog } from "@/lib/rbac";
import { validateShippingBeneficiary, shippingSettlementStatus, SettlementConfigError } from "@/lib/settlement-config";

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
    const { data: staff, error: staffError } = await supabase.from("shipping_staff").select("role,is_active")
      .eq("user_id", auth.sub).maybeSingle();
    if (staffError) return NextResponse.json({ error: "Could not verify settings access" }, { status: 503, headers });
    if (staff?.is_active !== true || !["admin", "superadmin"].includes(String(staff.role).toLowerCase())) {
      return NextResponse.json({ error: "Only an active shipping admin can read settings" }, { status: 403, headers });
    }
    const { data, error } = await supabase
      .from("shipping_settings")
      .select("key, value, description");

    if (error) throw error;

    // Convert array of { key, value } to a flat object
    const settings: Record<string, any> = {};
    for (const row of data || []) {
      settings[row.key] = row.value;
    }

    const settlement = await shippingSettlementStatus(settings.shipping_company_user_id);
    return NextResponse.json({ settings, settlement }, { headers: { ...headers, "Cache-Control": "no-store" } });
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
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Settings changes must originate from shipping" }, { status: 403, headers });
  }

  try {
    // A signed but stale admin token does not override deactivation/demotion.
    const { data: staff, error: staffError } = await supabase.from("shipping_staff").select("role,is_active")
      .eq("user_id", auth.sub).maybeSingle();
    if (staffError) return NextResponse.json({ error: "Could not verify settings access" }, { status: 503, headers });
    if (staff?.is_active !== true || !["admin", "superadmin"].includes(String(staff.role).toLowerCase())) {
      return NextResponse.json({ error: "Only an active shipping admin can manage settings" }, { status: 403, headers });
    }
    const body = await request.json();
    const { settings } = body;

    if (!settings || typeof settings !== "object" || Array.isArray(settings) || Object.keys(settings).length === 0) {
      return NextResponse.json({ error: "Settings object required" }, { status: 400, headers });
    }

    const normalized = { ...settings };
    if (Object.prototype.hasOwnProperty.call(settings, "shipping_company_user_id")) {
      const beneficiary = await validateShippingBeneficiary(settings.shipping_company_user_id);
      normalized.shipping_company_user_id = beneficiary.company_user_id;
    }
    const now = new Date().toISOString();

    // One checked statement prevents partial success across a settings batch.
    const { error: saveError } = await supabase.from("shipping_settings")
      .upsert(Object.entries(normalized).map(([key, value]) => ({ key, value: JSON.stringify(value), updated_at: now })), { onConflict: "key" });
    if (saveError) return NextResponse.json({ error: "Could not save shipping settings" }, { status: 503, headers });
    auditLog({ actorId: auth.sub, actorRole: staff.role, action: "settings.update", resourceType: "shipping_settings",
      details: { keys: Object.keys(normalized) } });

    return NextResponse.json({ message: "Settings updated" }, { headers });
  } catch (err) {
    if (err instanceof SettlementConfigError) {
      return NextResponse.json({ error: err.code, error_description: err.message }, { status: err.status, headers });
    }
    console.error("Error updating settings:", err);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500, headers });
  }
}
