import { NextRequest, NextResponse } from "next/server";
import { authenticateShippingRequest } from "@/lib/shipping-auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

// GET /api/analytics — Comprehensive analytics for dashboard
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = authenticateShippingRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "week"; // today, week, month, all
    const now = new Date();
    let fromDate: string;

    switch (period) {
      case "today":
        fromDate = now.toISOString().slice(0, 10) + "T00:00:00.000Z";
        break;
      case "week": {
        const d = new Date(now); d.setDate(d.getDate() - 7);
        fromDate = d.toISOString();
        break;
      }
      case "month": {
        const d = new Date(now); d.setMonth(d.getMonth() - 1);
        fromDate = d.toISOString();
        break;
      }
      default:
        fromDate = "2020-01-01T00:00:00.000Z";
    }

    // Run all queries in parallel
    const [
      deliveriesRes,
      completedRes,
      cancelledRes,
      failedRes,
      returnedRes,
      driversRes,
      onlineDriversRes,
      feesRes,
      ratingsRes,
      disputesRes,
    ] = await Promise.all([
      // Total deliveries in period
      supabase.from("delivery_jobs").select("id", { count: "exact", head: true }).gte("created_at", fromDate),
      // Completed
      supabase.from("delivery_jobs").select("id, shipping_fee, platform_fee, driver_payout, actual_pickup_time, actual_delivery_time", { count: "exact" })
        .eq("status", "completed").gte("actual_delivery_time", fromDate),
      // Cancelled
      supabase.from("delivery_jobs").select("id", { count: "exact", head: true }).eq("status", "cancelled").gte("created_at", fromDate),
      // Failed
      supabase.from("delivery_jobs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", fromDate),
      // Returned
      supabase.from("delivery_jobs").select("id", { count: "exact", head: true }).eq("status", "returned").gte("created_at", fromDate),
      // Total drivers
      supabase.from("drivers").select("id", { count: "exact", head: true }).eq("is_active", true),
      // Online drivers
      supabase.from("drivers").select("id", { count: "exact", head: true }).eq("is_online", true),
      // Fee totals
      supabase.from("fee_transactions").select("type, amount").gte("created_at", fromDate),
      // Average rating
      supabase.from("driver_ratings").select("rating").gte("created_at", fromDate),
      // Open disputes
      supabase.from("disputes").select("id", { count: "exact", head: true }).in("status", ["open", "investigating"]),
    ]);

    const totalDeliveries = deliveriesRes.count || 0;
    const completedCount = completedRes.count || 0;
    const cancelledCount = cancelledRes.count || 0;
    const failedCount = failedRes.count || 0;
    const returnedCount = returnedRes.count || 0;

    // Revenue calculations
    const completedJobs = completedRes.data || [];
    const totalRevenue = completedJobs.reduce((s, j) => s + (parseFloat(String(j.shipping_fee)) || 0), 0);
    const totalPlatformFee = completedJobs.reduce((s, j) => s + (parseFloat(String(j.platform_fee)) || 0), 0);
    const totalDriverPayout = completedJobs.reduce((s, j) => s + (parseFloat(String(j.driver_payout)) || 0), 0);

    // Average delivery time (pickup → delivery in minutes)
    const deliveryTimes = completedJobs
      .filter(j => j.actual_pickup_time && j.actual_delivery_time)
      .map(j => (new Date(j.actual_delivery_time).getTime() - new Date(j.actual_pickup_time).getTime()) / 60000);
    const avgDeliveryMinutes = deliveryTimes.length > 0
      ? deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length
      : 0;

    // Success rate
    const totalFinished = completedCount + cancelledCount + failedCount + returnedCount;
    const successRate = totalFinished > 0 ? (completedCount / totalFinished) * 100 : 0;

    // Average rating
    const ratings = (ratingsRes.data || []).map(r => r.rating);
    const avgRating = ratings.length > 0
      ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length
      : 0;

    return NextResponse.json({
      period,
      deliveries: {
        total: totalDeliveries,
        completed: completedCount,
        cancelled: cancelledCount,
        failed: failedCount,
        returned: returnedCount,
        success_rate: Math.round(successRate * 10) / 10,
      },
      revenue: {
        total: Math.round(totalRevenue * 100) / 100,
        platform_fee: Math.round(totalPlatformFee * 100) / 100,
        driver_payouts: Math.round(totalDriverPayout * 100) / 100,
      },
      drivers: {
        total: driversRes.count || 0,
        online: onlineDriversRes.count || 0,
      },
      performance: {
        avg_delivery_minutes: Math.round(avgDeliveryMinutes),
        avg_rating: Math.round(avgRating * 10) / 10,
        total_ratings: ratings.length,
      },
      disputes: {
        open: disputesRes.count || 0,
      },
    }, { headers });
  } catch (err) {
    console.error("Error fetching analytics:", err);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500, headers });
  }
}
