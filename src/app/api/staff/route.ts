import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateRequest } from "@/lib/auth";
import { authenticateShippingRequest } from "@/lib/shipping-auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";

const MAIN_SUPABASE_URL = process.env.MAIN_SUPABASE_URL || "https://akiecgwcxadcpqlvntmf.supabase.co";
const MAIN_SUPABASE_KEY = process.env.MAIN_SUPABASE_SERVICE_KEY || "";
function getMainDb() {
  return createClient(MAIN_SUPABASE_URL, MAIN_SUPABASE_KEY, { auth: { persistSession: false } });
}

/** Auto-activate shipping app for a user on the main platform */
async function activateShippingForUser(userId: string, role: string): Promise<void> {
  if (!MAIN_SUPABASE_KEY) return;
  const mainDb = getMainDb();
  try {
    // Find the shipping app ID
    const { data: app } = await mainDb.from("apps").select("id").eq("slug", "shipping").single();
    if (!app) return;

    // Create subscription (ignore if exists)
    await mainDb.from("user_app_subscriptions").upsert({
      user_id: userId,
      app_id: app.id,
      subscription_type: "app",
      app_tier: "starter",
      status: "active",
      price_monthly: 0,
      currency: "NLE",
    }, { onConflict: "user_id,app_id" });

    // Enable shipping in user_apps_settings (for app launcher)
    const { data: existingSettings } = await mainDb.from("user_apps_settings").select("user_id").eq("user_id", userId).maybeSingle();
    if (existingSettings) {
      await mainDb.from("user_apps_settings").update({ shipping_enabled: true }).eq("user_id", userId);
    } else {
      await mainDb.from("user_apps_settings").insert({ user_id: userId, shipping_enabled: true }).select().maybeSingle();
    }

    // Send notification
    await mainDb.from("notifications").insert({
      user_id: userId,
      type: "shipping_staff_added",
      title: `Shipping ${role.charAt(0).toUpperCase() + role.slice(1)} Role`,
      message: `You have been added as a ${role} for Peeap Shipping. Access your dispatch dashboard at my.peeap.com/shipping`,
      action_url: "/shipping",
      is_read: false,
    });
  } catch (err) {
    console.error("[Staff] Failed to activate shipping for user:", err);
  }
}

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

// GET /api/staff — List staff members (authenticated)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = authenticateShippingRequest(request) || await authenticateRequest(request);
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

  const auth = authenticateShippingRequest(request) || await authenticateRequest(request);
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
      activateShippingForUser(user_id, role);
      return NextResponse.json({ staff: reactivated }, { status: 200, headers });
    }

    // Use name/email/phone from frontend (from search results)
    const finalName = body.name || "Unknown User";
    const finalEmail = body.email || null;
    const finalPhone = body.phone || null;

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

    // Auto-activate shipping app + send notification on main platform
    activateShippingForUser(user_id, role);

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

  const auth = authenticateShippingRequest(request) || await authenticateRequest(request);
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
