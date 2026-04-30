import { NextResponse } from "next/server";
import { AuthPayload } from "./auth";
import { supabase } from "./supabase";

interface DriverRecord {
  id: string;
  name: string;
  phone: string;
  vehicle_type: string;
  is_active: boolean;
  is_online: boolean;
  active_job_id: string | null;
}

/**
 * Verify the authenticated user is an active, approved driver.
 * Returns the driver record or null.
 */
export async function getDriverRecord(
  auth: AuthPayload
): Promise<DriverRecord | null> {
  const { data } = await supabase
    .from("drivers")
    .select("id, name, phone, vehicle_type, is_active, is_online, active_job_id")
    .eq("user_id", auth.sub)
    .eq("is_active", true)
    .maybeSingle();

  return data || null;
}

/**
 * Guard: returns error response if user is not an approved driver.
 * Returns null if the user is a valid driver.
 */
export async function requireDriver(
  auth: AuthPayload | null,
  headers: Record<string, string>
): Promise<{ error: NextResponse } | { driver: DriverRecord }> {
  if (!auth) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401, headers }) };
  }

  const driver = await getDriverRecord(auth);
  if (!driver) {
    return {
      error: NextResponse.json(
        { error: "You are not registered as a delivery driver. Apply at shipping.peeap.com/apply" },
        { status: 403, headers }
      ),
    };
  }

  return { driver };
}
