import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { createShippingToken } from "@/lib/shipping-auth";

// Main Peeap Supabase for user authentication
const MAIN_SUPABASE_URL = process.env.MAIN_SUPABASE_URL || "https://akiecgwcxadcpqlvntmf.supabase.co";
const MAIN_SUPABASE_KEY = process.env.MAIN_SUPABASE_SERVICE_KEY || "";

function getMainSupabase() {
  return createClient(MAIN_SUPABASE_URL, MAIN_SUPABASE_KEY, { auth: { persistSession: false } });
}

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

/**
 * POST /api/auth/login
 * Authenticates against main Peeap user database
 * Returns a session token stored in shipping_staff context
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400, headers });
    }

    if (!MAIN_SUPABASE_KEY) {
      console.error("[Auth Login] MAIN_SUPABASE_SERVICE_KEY is not configured");
      return NextResponse.json({ error: "Shipping sign-in is temporarily unavailable" }, { status: 503, headers });
    }

    const mainDb = getMainSupabase();

    // Find user by email in main Peeap DB
    const { data: users, error: userLookupError } = await mainDb
      .from("users")
      .select("id, email, password_hash, first_name, last_name, phone, roles, profile_picture")
      .eq("email", String(email).trim().toLowerCase())
      .limit(1);

    if (userLookupError) {
      console.error("[Auth Login] Main account lookup failed:", userLookupError.code);
      return NextResponse.json({ error: "Shipping sign-in is temporarily unavailable" }, { status: 503, headers });
    }

    const user = users?.[0];
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401, headers });
    }

    // Match the main Peeap login: older accounts may still have a legacy
    // plaintext password. Upgrade that record to bcrypt on successful login.
    let passwordValid = false;
    const hash = String(user.password_hash || "");
    if (/^\$2[aby]\$/.test(hash)) {
      passwordValid = await bcrypt.compare(password, hash);
    } else if (hash && !hash.startsWith("$argon2")) {
      passwordValid = hash === password;
      if (passwordValid) {
        const upgradedHash = await bcrypt.hash(password, 12);
        const { error: upgradeError } = await mainDb.from("users")
          .update({ password_hash: upgradedHash })
          .eq("id", user.id)
          .eq("password_hash", hash);
        if (upgradeError) {
          console.error("[Auth Login] Password upgrade failed:", upgradeError.code);
          return NextResponse.json({ error: "Shipping sign-in is temporarily unavailable" }, { status: 503, headers });
        }
      }
    }

    if (!passwordValid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401, headers });
    }

    // Check if user is in shipping_staff table
    const { data: staffRecord, error: staffLookupError } = await supabase
      .from("shipping_staff")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (staffLookupError) {
      console.error("[Auth Login] Shipping staff lookup failed:", staffLookupError.code);
      return NextResponse.json({ error: "Shipping sign-in is temporarily unavailable" }, { status: 503, headers });
    }

    // Auto-add as admin if they're a superadmin/admin in main system
    let staffRole = staffRecord?.role || "dispatcher";

    // Shipping superadmin emails — auto-register as admin
    const SHIPPING_ADMINS = ["dev@school.edu.sl"];
    const isShippingAdmin = SHIPPING_ADMINS.includes(user.email.toLowerCase());

    const userRoles: string[] = Array.isArray(user.roles) ? user.roles : [];
    const isMainAdmin = userRoles.includes("admin") || userRoles.includes("superadmin");

    if (!staffRecord && (isMainAdmin || isShippingAdmin)) {
      // Auto-register admins as shipping admins
      const { data: newStaff, error: staffCreateError } = await supabase
        .from("shipping_staff")
        .insert({
          user_id: user.id,
          name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email,
          email: user.email,
          phone: user.phone || null,
          role: "admin",
          is_active: true,
          permissions: [],
        })
        .select()
        .single();

      if (staffCreateError || !newStaff) {
        console.error("[Auth Login] Shipping staff registration failed:", staffCreateError?.code);
        return NextResponse.json({ error: "Shipping sign-in is temporarily unavailable" }, { status: 503, headers });
      }
      staffRole = newStaff.role;
    } else if (!staffRecord) {
      return NextResponse.json({ error: "You don't have access to the shipping dashboard. Contact an admin." }, { status: 403, headers });
    } else if (!staffRecord.is_active) {
      return NextResponse.json({ error: "Your shipping account has been deactivated." }, { status: 403, headers });
    }

    // Generate a signed session token
    const token = createShippingToken({
      sub: user.id,
      email: user.email,
      role: staffRole,
      iat: Date.now(),
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
        role: staffRole,
        profile_picture: user.profile_picture,
      },
      token,
    }, { headers });

    // Set cookie
    response.cookies.set("peeap_shipping_token", token, {
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    return response;
  } catch (err: any) {
    console.error("[Auth Login] Error:", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500, headers });
  }
}
