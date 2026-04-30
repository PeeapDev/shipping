import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

// GET /api/driver/jobs — List driver's jobs (assigned, history) or available jobs
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    // Find driver record
    const { data: driver } = await supabase
      .from("drivers")
      .select("id, city, current_lat, current_lng")
      .eq("user_id", auth.sub)
      .eq("is_active", true)
      .single();

    if (!driver) {
      return NextResponse.json({ error: "Driver not found" }, { status: 404, headers });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "active"; // active | available | history
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const offset = parseInt(searchParams.get("offset") || "0");

    if (type === "available") {
      // Jobs available for this driver (pending + in driver's city or offered to them)
      // First check direct offers
      const { data: offers } = await supabase
        .from("driver_job_offers")
        .select("job_id, expires_at, distance_km")
        .eq("driver_id", driver.id)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString());

      const offerJobIds = (offers || []).map((o) => o.job_id);

      // Also get unassigned manual-dispatch jobs in driver's city
      let availableQuery = supabase
        .from("delivery_jobs")
        .select("*", { count: "exact" })
        .eq("status", "pending")
        .is("driver_id", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (driver.city) {
        availableQuery = availableQuery.ilike("pickup_city", `%${driver.city}%`);
      }

      const { data: manualJobs, count: manualCount } = await availableQuery;

      // Get offered jobs details
      let offeredJobs: any[] = [];
      if (offerJobIds.length > 0) {
        const { data } = await supabase
          .from("delivery_jobs")
          .select("*")
          .in("id", offerJobIds)
          .eq("status", "pending");
        offeredJobs = data || [];
      }

      // Merge, deduplicate, mark offered ones
      const allJobs = [...offeredJobs, ...(manualJobs || [])];
      const seen = new Set<string>();
      const deduplicated = allJobs.filter((j) => {
        if (seen.has(j.id)) return false;
        seen.add(j.id);
        return true;
      });

      // Annotate offered jobs with offer info
      const jobsWithOffers = deduplicated.map((j) => {
        const offer = (offers || []).find((o) => o.job_id === j.id);
        return {
          ...j,
          has_offer: !!offer,
          offer_expires_at: offer?.expires_at || null,
          offer_distance_km: offer?.distance_km || null,
        };
      });

      return NextResponse.json(
        { jobs: jobsWithOffers, total: jobsWithOffers.length },
        { headers }
      );
    }

    if (type === "active") {
      // Driver's currently active jobs (assigned, picked_up, in_transit)
      const { data, error, count } = await supabase
        .from("delivery_jobs")
        .select("*", { count: "exact" })
        .eq("driver_id", driver.id)
        .in("status", ["assigned", "picked_up", "in_transit"])
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return NextResponse.json({ jobs: data || [], total: count || 0 }, { headers });
    }

    // History (completed, cancelled, failed, delivered)
    const { data, error, count } = await supabase
      .from("delivery_jobs")
      .select("*", { count: "exact" })
      .eq("driver_id", driver.id)
      .in("status", ["delivered", "completed", "cancelled", "failed"])
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return NextResponse.json({ jobs: data || [], total: count || 0 }, { headers });
  } catch (err) {
    console.error("Error fetching driver jobs:", err);
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500, headers });
  }
}
