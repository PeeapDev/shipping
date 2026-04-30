import { NextRequest, NextResponse } from "next/server";
import { authenticateShippingRequest } from "@/lib/shipping-auth";
import { authenticateServiceCall } from "@/lib/auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { requirePermission, auditLog } from "@/lib/rbac";
import { pushNewJobOffer } from "@/lib/push";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

/**
 * Helper: get a setting value from shipping_settings table
 */
async function getSetting(key: string, defaultValue: number): Promise<number> {
  const { data } = await supabase
    .from("shipping_settings")
    .select("value")
    .eq("key", key)
    .single();

  if (data?.value !== undefined) {
    return parseFloat(String(data.value)) || defaultValue;
  }
  return defaultValue;
}

/**
 * Simple Haversine distance in km between two lat/lng points
 */
function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// POST /api/dispatch — Auto-dispatch: find and offer job to nearest drivers
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  // Only staff (with dispatch permission) or service calls
  const isService = authenticateServiceCall(request);
  if (!isService) {
    const auth = authenticateShippingRequest(request);
    const rbacError = requirePermission(auth, "manual_dispatch", headers);
    if (rbacError) return rbacError;
  }

  try {
    const { job_id } = await request.json();
    if (!job_id) {
      return NextResponse.json({ error: "job_id required" }, { status: 400, headers });
    }

    // Fetch the job
    const { data: job } = await supabase
      .from("delivery_jobs")
      .select("id, status, pickup_lat, pickup_lng, pickup_city, dispatch_attempts")
      .eq("id", job_id)
      .single();

    if (!job || job.status !== "pending") {
      return NextResponse.json({ error: "Job not available for dispatch" }, { status: 400, headers });
    }

    // Get dispatch settings
    const radiusKm = await getSetting("dispatch_radius_km", 10);
    const timeoutSeconds = await getSetting("offer_timeout_seconds", 60);
    const maxAttempts = await getSetting("max_dispatch_attempts", 3);
    const minRating = await getSetting("min_driver_rating", 3.0);

    if ((job.dispatch_attempts || 0) >= maxAttempts) {
      return NextResponse.json({
        message: "Max dispatch attempts reached. Flagged for manual dispatch.",
        dispatch_attempts: job.dispatch_attempts,
      }, { headers });
    }

    // Find online, available drivers
    let driversQuery = supabase
      .from("drivers")
      .select("id, name, current_lat, current_lng, average_rating, total_deliveries, city")
      .eq("is_active", true)
      .eq("is_online", true)
      .eq("is_available", true)
      .is("active_job_id", null)
      .gte("average_rating", minRating);

    const { data: candidates } = await driversQuery;

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ message: "No available drivers", offered_to: 0 }, { headers });
    }

    // Filter by distance if job has coordinates
    let ranked = candidates;
    if (job.pickup_lat && job.pickup_lng) {
      ranked = candidates
        .map((d) => ({
          ...d,
          distance_km: d.current_lat && d.current_lng
            ? haversineKm(job.pickup_lat, job.pickup_lng, d.current_lat, d.current_lng)
            : Infinity,
        }))
        .filter((d) => d.distance_km <= radiusKm)
        .sort((a, b) => a.distance_km - b.distance_km);
    } else if (job.pickup_city) {
      // Fallback: filter by city match
      ranked = candidates.filter(
        (d) => d.city?.toLowerCase() === job.pickup_city.toLowerCase()
      );
    }

    if (ranked.length === 0) {
      return NextResponse.json({ message: "No drivers within range", offered_to: 0 }, { headers });
    }

    // Get already-declined/expired drivers for this job
    const { data: previousOffers } = await supabase
      .from("driver_job_offers")
      .select("driver_id")
      .eq("job_id", job_id)
      .in("status", ["declined", "expired"]);

    const excludeIds = new Set((previousOffers || []).map((o) => o.driver_id));
    const eligible = ranked.filter((d) => !excludeIds.has(d.id));

    if (eligible.length === 0) {
      return NextResponse.json({ message: "All nearby drivers already declined", offered_to: 0 }, { headers });
    }

    // Offer to the top driver
    const topDriver = eligible[0];
    const expiresAt = new Date(Date.now() + timeoutSeconds * 1000).toISOString();

    await supabase.from("driver_job_offers").insert({
      job_id,
      driver_id: topDriver.id,
      status: "pending",
      expires_at: expiresAt,
      distance_km: (topDriver as any).distance_km || null,
    });

    // Update dispatch attempts
    await supabase
      .from("delivery_jobs")
      .update({
        dispatch_mode: "auto",
        dispatch_attempts: (job.dispatch_attempts || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job_id);

    // Push notify the driver about the job offer
    const { data: jobForPush } = await supabase
      .from("delivery_jobs")
      .select("shipping_fee")
      .eq("id", job_id)
      .single();
    pushNewJobOffer(topDriver.id, job.id, jobForPush?.shipping_fee || 0).catch(() => {});

    return NextResponse.json({
      message: `Job offered to driver ${topDriver.name}`,
      offered_to: 1,
      driver_id: topDriver.id,
      expires_at: expiresAt,
    }, { headers });
  } catch (err) {
    console.error("Error in auto-dispatch:", err);
    return NextResponse.json({ error: "Dispatch failed" }, { status: 500, headers });
  }
}

// GET /api/dispatch — Expire stale offers + unassign stale jobs (called by cron or dashboard polling)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const now = new Date().toISOString();

    // 1. Expire stale driver offers (past their timeout)
    const { data: expired } = await supabase
      .from("driver_job_offers")
      .update({ status: "expired", responded_at: now })
      .eq("status", "pending")
      .lt("expires_at", now)
      .select("job_id");

    const expiredCount = expired?.length || 0;

    // 2. Unassign stale assigned jobs (driver accepted but never picked up within 30 min)
    const staleAssignedCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: staleJobs } = await supabase
      .from("delivery_jobs")
      .select("id, job_number, driver_id")
      .eq("status", "assigned")
      .lt("updated_at", staleAssignedCutoff)
      .is("actual_pickup_time", null)
      .limit(20);

    let unassignedCount = 0;
    if (staleJobs?.length) {
      for (const job of staleJobs) {
        // Unassign driver and revert to pending for re-dispatch
        await supabase.from("delivery_jobs").update({
          status: "pending",
          driver_id: null,
          updated_at: now,
        }).eq("id", job.id).eq("status", "assigned");

        // Free the driver
        if (job.driver_id) {
          await supabase.from("drivers").update({
            active_job_id: null,
            is_available: true,
            updated_at: now,
          }).eq("id", job.driver_id).eq("active_job_id", job.id);
        }

        // Create tracking update
        await supabase.from("tracking_updates").insert({
          job_id: job.id,
          status: "pending",
          message: "Driver did not pick up within 30 minutes. Job reassigned to dispatch queue.",
          updated_by: null,
        });

        // Re-trigger auto-dispatch for this job
        const SELF_URL = process.env.NEXT_PUBLIC_APP_URL
          || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3500");
        const SVC_SECRET = process.env.SERVICE_SECRET || "";
        if (SVC_SECRET) {
          fetch(`${SELF_URL}/api/dispatch`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Service-Secret": SVC_SECRET },
            body: JSON.stringify({ job_id: job.id }),
          }).catch(() => {});
        }

        unassignedCount++;
        console.log(`[Dispatch] Unassigned stale job ${job.job_number} — driver didn't pick up in 30 min`);
      }
    }

    return NextResponse.json({
      expired_offers: expiredCount,
      unassigned_stale_jobs: unassignedCount,
    }, { headers });
  } catch (err) {
    console.error("Error in dispatch cleanup:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500, headers });
  }
}
