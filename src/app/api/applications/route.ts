import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateRequest } from "@/lib/auth";
import { authenticateShippingRequest } from "@/lib/shipping-auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { requirePermission, auditLog } from "@/lib/rbac";

const MAIN_SUPABASE_URL = process.env.MAIN_SUPABASE_URL || "https://akiecgwcxadcpqlvntmf.supabase.co";
const MAIN_SUPABASE_KEY = process.env.MAIN_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function getMainSupabase() {
  return createClient(MAIN_SUPABASE_URL, MAIN_SUPABASE_KEY, { auth: { persistSession: false } });
}

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

// GET /api/applications — List all driver applications (admin/staff)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = authenticateShippingRequest(request);
  const rbacCheck = requirePermission(auth, "view_applications", headers);
  if (rbacCheck) return rbacCheck;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending";
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

    let query = supabase
      .from("driver_applications")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json(
      { applications: data || [], total: count || 0 },
      { headers }
    );
  } catch (err) {
    console.error("Error fetching applications:", err);
    return NextResponse.json(
      { error: "Failed to fetch applications" },
      { status: 500, headers }
    );
  }
}

// PUT /api/applications — Approve or reject an application (admin/staff)
export async function PUT(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = authenticateShippingRequest(request);
  const rbacCheck2 = requirePermission(auth, "approve_applications", headers);
  if (rbacCheck2) return rbacCheck2;

  try {
    const body = await request.json();
    const { application_id, action, rejection_reason } = body;

    if (!application_id || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "application_id and action (approve/reject) required" },
        { status: 400, headers }
      );
    }

    // Get the application
    const { data: app, error: fetchError } = await supabase
      .from("driver_applications")
      .select("*")
      .eq("id", application_id)
      .single();

    if (fetchError || !app) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404, headers }
      );
    }

    if (app.status !== "pending" && app.status !== "under_review") {
      return NextResponse.json(
        { error: `Application already ${app.status}` },
        { status: 400, headers }
      );
    }

    if (action === "approve") {
      // Create the driver record from the application
      const { error: driverError } = await supabase
        .from("drivers")
        .insert({
          user_id: app.user_id,
          name: app.name,
          phone: app.phone,
          email: app.email,
          vehicle_type: app.vehicle_type,
          vehicle_plate: app.vehicle_plate,
          profile_picture: app.profile_photo_url,
          city: app.city,
          is_active: true,
          is_available: true,
        });

      if (driverError) throw driverError;

      // Update application status
      await supabase
        .from("driver_applications")
        .update({
          status: "approved",
          reviewed_by: auth!.sub,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", application_id);

      // Auto-activate shipping app in the mobile app for this driver
      // This creates the subscription in the main Peeap DB so the mobile app shows the shipping feature
      try {
        const mainDb = getMainSupabase();

        // Ensure the 'shipping' app exists in the apps table
        await mainDb.from("apps").upsert({
          id: "shipping",
          slug: "shipping",
          name: "Shipping & Delivery",
          description: "Delivery driver dashboard and earnings",
          icon: "local_shipping",
          category: "logistics",
          is_active: true,
          sort_order: 4,
        }, { onConflict: "id" });

        // Create user subscription
        await mainDb.from("user_app_subscriptions").upsert({
          user_id: app.user_id,
          app_id: "shipping",
          subscription_type: "app",
          app_tier: "driver",
          status: "active",
        }, { onConflict: "user_id,app_id" });
      } catch (subErr) {
        // Non-critical: driver is still created even if app activation fails
        console.error("Failed to auto-activate shipping app:", subErr);
      }

      // Send chat notification to the driver about their approval
      const CHAT_API = process.env.CHAT_API_URL || "https://chat.peeap.com";
      const SVC_SECRET = process.env.SERVICE_SECRET || "";
      if (SVC_SECRET && app.user_id) {
        fetch(`${CHAT_API}/api/ecommerce/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Service-Secret": SVC_SECRET },
          body: JSON.stringify({
            order_id: `driver-approval-${application_id}`,
            store_id: "shipping",
            buyer_user_id: app.user_id,
            seller_user_id: app.user_id,
            category: "shipping_update",
            content: `Welcome to Peeap Shipping, ${app.name}!\n\nYour driver application has been approved. You can now access your delivery dashboard through the Shipping app in your Peeap account.\n\nStart accepting delivery jobs and earn money today!`,
            rich_content: {
              type: "driver_approved",
              driver_name: app.name,
              vehicle_type: app.vehicle_type,
            },
          }),
        }).catch(() => {});
      }

      // Also send in-app notification via main API
      const MAIN_API = process.env.MAIN_API_URL || "https://api.peeap.com";
      if (SVC_SECRET && app.user_id) {
        fetch(`${MAIN_API}/api/notifications/internal`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Service-Secret": SVC_SECRET },
          body: JSON.stringify({
            user_id: app.user_id,
            type: "shipping_update",
            title: "Driver Application Approved!",
            message: "Welcome to Peeap Shipping! Your driver application has been approved. Start accepting delivery jobs now.",
            action_url: "/apps/shipping",
            source_service: "shipping",
            priority: "high",
          }),
        }).catch(() => {});
      }

      auditLog({
        actorId: auth!.sub, actorEmail: auth!.email, actorRole: auth!.role,
        action: "approve_application", resourceType: "application", resourceId: application_id,
        details: { driver_user_id: app.user_id, driver_name: app.name },
      });

      return NextResponse.json(
        { message: "Application approved. Driver account created.", status: "approved" },
        { headers }
      );
    } else {
      // Reject
      await supabase
        .from("driver_applications")
        .update({
          status: "rejected",
          rejection_reason: rejection_reason || "Application did not meet requirements",
          reviewed_by: auth!.sub,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", application_id);

      auditLog({
        actorId: auth!.sub, actorEmail: auth!.email, actorRole: auth!.role,
        action: "reject_application", resourceType: "application", resourceId: application_id,
        details: { driver_user_id: app.user_id, reason: rejection_reason },
      });

      return NextResponse.json(
        { message: "Application rejected.", status: "rejected" },
        { headers }
      );
    }
  } catch (err) {
    console.error("Error reviewing application:", err);
    return NextResponse.json(
      { error: "Failed to review application" },
      { status: 500, headers }
    );
  }
}
