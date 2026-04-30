import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateRequest } from "@/lib/auth";
import { authenticateShippingRequest } from "@/lib/shipping-auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { requirePermission, auditLog } from "@/lib/rbac";
import { sendStaffInviteSms } from "@/lib/sms";

const MAIN_SUPABASE_URL = process.env.MAIN_SUPABASE_URL || "https://akiecgwcxadcpqlvntmf.supabase.co";
const MAIN_SUPABASE_KEY = process.env.MAIN_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
function getMainSupabase() {
  return createClient(MAIN_SUPABASE_URL, MAIN_SUPABASE_KEY, { auth: { persistSession: false } });
}

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

/**
 * POST /api/staff/invite — Send invitation to a Peeap user to join as staff
 * Body: { user_id, role, message? }
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = authenticateShippingRequest(request);
  const rbacError = requirePermission(auth, "manage_staff", headers);
  if (rbacError) return rbacError;

  try {
    const { user_id, role, message } = await request.json();

    if (!user_id || !role) {
      return NextResponse.json({ error: "user_id and role required" }, { status: 400, headers });
    }

    if (!["dispatcher", "manager", "admin"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400, headers });
    }

    // Check if user already has a pending invitation
    const { data: existing } = await supabase
      .from("staff_invitations")
      .select("id, status")
      .eq("user_id", user_id)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "User already has a pending invitation" }, { status: 400, headers });
    }

    // Check if user is already staff
    const { data: existingStaff } = await supabase
      .from("shipping_staff")
      .select("id, is_active")
      .eq("user_id", user_id)
      .maybeSingle();

    if (existingStaff?.is_active) {
      return NextResponse.json({ error: "User is already active staff" }, { status: 400, headers });
    }

    // Get user info from main Peeap DB
    const mainDb = getMainSupabase();
    const { data: peeapUser } = await mainDb
      .from("users")
      .select("id, first_name, last_name, email, phone")
      .eq("id", user_id)
      .single();

    if (!peeapUser) {
      return NextResponse.json({ error: "Peeap user not found" }, { status: 404, headers });
    }

    // Create invitation
    const { data: invitation, error: inviteError } = await supabase
      .from("staff_invitations")
      .insert({
        user_id,
        invited_by: auth!.sub,
        role,
        status: "pending",
        message: message || null,
      })
      .select()
      .single();

    if (inviteError) throw inviteError;

    // Send SMS notification
    if (peeapUser.phone) {
      const inviterName = auth!.email || "Peeap Shipping";
      sendStaffInviteSms(peeapUser.phone, inviterName);
    }

    // Send chat notification to the invited user
    const CHAT_API = process.env.CHAT_API_URL || "https://chat.peeap.com";
    const SERVICE_SECRET = process.env.SERVICE_SECRET || "";
    fetch(`${CHAT_API}/api/ecommerce/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Service-Secret": SERVICE_SECRET },
      body: JSON.stringify({
        order_id: `staff_invite_${invitation.id}`,
        store_id: "peeap-shipping",
        buyer_user_id: user_id,
        seller_user_id: auth!.sub,
        category: "order_update",
        content: `🚚 You've been invited to join Peeap Shipping as a ${role}!\n\n${message || "Open the notification to accept or decline."}\n\nAccept this invitation to get started.`,
        rich_content: {
          type: "staff_invitation",
          invitation_id: invitation.id,
          role,
          invited_by: auth!.email,
        },
      }),
    }).catch(() => {});

    auditLog({
      actorId: auth!.sub, actorEmail: auth!.email, actorRole: auth!.role,
      action: "invite_staff", resourceType: "staff_invitation", resourceId: invitation.id,
      details: { invited_user_id: user_id, role, user_name: `${peeapUser.first_name} ${peeapUser.last_name}` },
    });

    return NextResponse.json({
      invitation,
      user: {
        id: peeapUser.id,
        name: `${peeapUser.first_name || ""} ${peeapUser.last_name || ""}`.trim(),
        email: peeapUser.email,
        phone: peeapUser.phone,
      },
    }, { status: 201, headers });
  } catch (err) {
    console.error("Error inviting staff:", err);
    return NextResponse.json({ error: "Failed to send invitation" }, { status: 500, headers });
  }
}

/**
 * GET /api/staff/invite — List pending invitations
 */
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = authenticateShippingRequest(request);
  const rbacError = requirePermission(auth, "view_staff", headers);
  if (rbacError) return rbacError;

  try {
    const { data, error } = await supabase
      .from("staff_invitations")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ invitations: data || [] }, { headers });
  } catch (err) {
    console.error("Error listing invitations:", err);
    return NextResponse.json({ error: "Failed to list invitations" }, { status: 500, headers });
  }
}

/**
 * PUT /api/staff/invite — Accept or decline invitation (called by the invited user)
 * Body: { invitation_id, action: "accept" | "decline" }
 */
export async function PUT(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  // This is called by a regular Peeap user (not necessarily staff yet)
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const { invitation_id, action } = await request.json();

    if (!invitation_id || !["accept", "decline"].includes(action)) {
      return NextResponse.json({ error: "invitation_id and action (accept/decline) required" }, { status: 400, headers });
    }

    // Fetch invitation — must be for this user
    const { data: invite } = await supabase
      .from("staff_invitations")
      .select("*")
      .eq("id", invitation_id)
      .eq("user_id", auth.sub)
      .eq("status", "pending")
      .single();

    if (!invite) {
      return NextResponse.json({ error: "Invitation not found or already responded" }, { status: 404, headers });
    }

    // Check expiry
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      await supabase.from("staff_invitations").update({ status: "expired" }).eq("id", invitation_id);
      return NextResponse.json({ error: "Invitation has expired" }, { status: 400, headers });
    }

    if (action === "decline") {
      await supabase.from("staff_invitations").update({
        status: "declined",
        responded_at: new Date().toISOString(),
      }).eq("id", invitation_id);

      return NextResponse.json({ message: "Invitation declined" }, { headers });
    }

    // === ACCEPT ===

    // Get user info from main DB
    const mainDb = getMainSupabase();
    const { data: peeapUser } = await mainDb
      .from("users")
      .select("id, first_name, last_name, email, phone")
      .eq("id", auth.sub)
      .single();

    // Create or reactivate staff record
    const { data: existingStaff } = await supabase
      .from("shipping_staff")
      .select("id")
      .eq("user_id", auth.sub)
      .maybeSingle();

    if (existingStaff) {
      await supabase.from("shipping_staff").update({
        role: invite.role,
        is_active: true,
        updated_at: new Date().toISOString(),
      }).eq("id", existingStaff.id);
    } else {
      await supabase.from("shipping_staff").insert({
        user_id: auth.sub,
        name: peeapUser ? `${peeapUser.first_name || ""} ${peeapUser.last_name || ""}`.trim() : auth.email || "",
        email: peeapUser?.email || auth.email || "",
        phone: peeapUser?.phone || "",
        role: invite.role,
        is_active: true,
        permissions: [],
      });
    }

    // Update invitation
    await supabase.from("staff_invitations").update({
      status: "accepted",
      responded_at: new Date().toISOString(),
    }).eq("id", invitation_id);

    auditLog({
      actorId: auth.sub, actorEmail: auth.email,
      action: "accept_staff_invitation", resourceType: "staff_invitation", resourceId: invitation_id,
      details: { role: invite.role },
    });

    return NextResponse.json({
      message: `Welcome! You are now a ${invite.role} on Peeap Shipping.`,
      role: invite.role,
    }, { headers });
  } catch (err) {
    console.error("Error responding to invitation:", err);
    return NextResponse.json({ error: "Failed to process invitation" }, { status: 500, headers });
  }
}
