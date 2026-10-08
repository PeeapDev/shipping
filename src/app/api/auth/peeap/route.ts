import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { createShippingToken } from "@/lib/shipping-auth";

export const dynamic = "force-dynamic";

/** Exchange a one-time Peeap handoff for a shipping-only session. */
export async function POST(request: NextRequest) {
  const mainKey = process.env.MAIN_SUPABASE_SERVICE_KEY;
  const mainUrl = process.env.MAIN_SUPABASE_URL || "https://akiecgwcxadcpqlvntmf.supabase.co";
  if (!mainKey) return NextResponse.json({ error: "Shipping sign-in is unavailable" }, { status: 503 });
  if (!process.env.SHIPPING_TOKEN_SECRET && !process.env.SERVICE_SECRET) {
    return NextResponse.json({ error: "Shipping sign-in is unavailable" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const token = body?.token;
  if (typeof token !== "string" || token.length < 32 || token.length > 256) {
    return NextResponse.json({ error: "Invalid sign-in request" }, { status: 400 });
  }

  const mainDb = createClient(mainUrl, mainKey, { auth: { persistSession: false } });
  const now = new Date().toISOString();
  // Conditional update consumes the handoff exactly once. No account identity
  // or role supplied by the browser is trusted.
  const { data: handoff, error: consumeError } = await mainDb.from("sso_tokens")
    .update({ used_at: now })
    .eq("token", token)
    .eq("target_app", "shipping")
    .is("used_at", null)
    .gt("expires_at", now)
    .select("user_id")
    .maybeSingle();
  if (consumeError) {
    console.error("[shipping auth] Main database rejected the SSO exchange:", consumeError.code);
    return NextResponse.json({ error: "Shipping sign-in is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }
  if (!handoff) {
    return NextResponse.json({ error: "Sign-in request expired. Try again." }, { status: 401 });
  }

  const { data: user, error: userError } = await mainDb.from("users")
    .select("id, email, first_name, last_name, phone, roles, profile_picture, is_active")
    .eq("id", handoff.user_id).maybeSingle();
  if (userError || !user || user.is_active === false) {
    return NextResponse.json({ error: "Account unavailable" }, { status: 403 });
  }

  const { data: staff, error: staffError } = await supabase.from("shipping_staff")
    .select("role, is_active").eq("user_id", user.id).maybeSingle();
  if (staffError) return NextResponse.json({ error: "Shipping sign-in is unavailable" }, { status: 503 });

  let staffRole = staff?.role;
  if (staff && !staff.is_active) {
    return NextResponse.json({ error: "Your shipping account has been deactivated" }, { status: 403 });
  }
  if (!staff) {
    const roles: string[] = Array.isArray(user.roles) ? user.roles.map((role: string) => role.toLowerCase()) : [];
    const mainAdmin = roles.includes("admin") || roles.includes("superadmin");
    if (!mainAdmin) {
      const nowMs = Date.now();
      const session = createShippingToken({ sub: user.id, email: user.email || "", role: "customer", iat: nowMs, exp: nowMs + 7 * 24 * 60 * 60 * 1000 });
      const response = NextResponse.json({ success: true, destination: "/my-orders", user: { id: user.id, email: user.email, name: `${user.first_name || ""} ${user.last_name || ""}`.trim(), role: "customer", profile_picture: user.profile_picture } });
      response.cookies.set("peeap_shipping_customer_token", session, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60 });
      response.cookies.delete("peeap_shipping_token");
      return response;
    }
    const { data: created, error: createError } = await supabase.from("shipping_staff")
      .insert({
        user_id: user.id,
        name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email,
        email: user.email,
        phone: user.phone || null,
        role: "admin",
        is_active: true,
        permissions: [],
      }).select("role").single();
    if (createError || !created) {
      return NextResponse.json({ error: "Shipping sign-in is unavailable" }, { status: 503 });
    }
    staffRole = created.role;
  }

  const nowMs = Date.now();
  const session = createShippingToken({
    sub: user.id, email: user.email || "", role: staffRole || "dispatcher",
    iat: nowMs, exp: nowMs + 7 * 24 * 60 * 60 * 1000,
  });
  const response = NextResponse.json({
    success: true,
    destination: "/dashboard",
    user: {
      id: user.id, email: user.email,
      name: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
      role: staffRole, profile_picture: user.profile_picture,
    },
  });
  response.cookies.set("peeap_shipping_token", session, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60,
  });
  response.cookies.delete("peeap_shipping_customer_token");
  return response;
}
