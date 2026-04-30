import { NextResponse } from "next/server";
import { ShippingAuthPayload } from "./shipping-auth";
import { supabase } from "./supabase";

/**
 * Permission map: what each role can do.
 * Admin has wildcard ("*") — can do everything.
 */
const ROLE_PERMISSIONS: Record<string, string[]> = {
  dispatcher: [
    "view_deliveries", "view_drivers", "assign_driver", "manual_dispatch",
    "view_tracking", "view_applications",
  ],
  manager: [
    "view_deliveries", "view_drivers", "assign_driver", "manual_dispatch",
    "view_tracking", "view_applications", "approve_applications",
    "reject_applications", "manage_zones", "view_staff", "resolve_disputes",
  ],
  admin: ["*"], // wildcard — full access
};

/**
 * Check if a staff member's role has a specific permission.
 */
export function hasPermission(role: string, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  return perms.includes("*") || perms.includes(permission);
}

/**
 * Guard: returns an error response if the staff member lacks the permission.
 * Returns null if authorized.
 */
export function requirePermission(
  auth: ShippingAuthPayload | null,
  permission: string,
  headers: Record<string, string>
): NextResponse | null {
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  if (!hasPermission(auth.role, permission)) {
    return NextResponse.json(
      { error: `Insufficient permissions. Requires: ${permission}` },
      { status: 403, headers }
    );
  }
  return null;
}

/**
 * Record an action in the audit log. Fire-and-forget.
 */
export function auditLog(params: {
  actorId: string;
  actorEmail?: string;
  actorRole?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}): void {
  Promise.resolve(
    supabase
      .from("audit_log")
      .insert({
        actor_id: params.actorId,
        actor_email: params.actorEmail || null,
        actor_role: params.actorRole || null,
        action: params.action,
        resource_type: params.resourceType,
        resource_id: params.resourceId || null,
        details: params.details || {},
        ip_address: params.ipAddress || null,
      })
  ).catch((err: unknown) => console.error("[AuditLog] Failed:", err));
}
