import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

// GET /api/driver/earnings — Earnings history with period summaries
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const { data: driver } = await supabase
      .from("drivers")
      .select("id, total_deliveries, total_earnings")
      .eq("user_id", auth.sub)
      .eq("is_active", true)
      .single();

    if (!driver) {
      return NextResponse.json({ error: "Driver not found" }, { status: 404, headers });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "today"; // today | week | month | all
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    // Calculate date range
    const now = new Date();
    let fromDate: string;

    switch (period) {
      case "today":
        fromDate = now.toISOString().slice(0, 10) + "T00:00:00.000Z";
        break;
      case "week": {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        fromDate = weekAgo.toISOString();
        break;
      }
      case "month": {
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        fromDate = monthAgo.toISOString();
        break;
      }
      default:
        fromDate = "2020-01-01T00:00:00.000Z";
    }

    // Fetch payouts for the period
    const { data: payouts, error, count } = await supabase
      .from("driver_payouts")
      .select("*", { count: "exact" })
      .eq("driver_id", driver.id)
      .gte("created_at", fromDate)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Calculate period totals
    const { data: periodTotals } = await supabase
      .from("driver_payouts")
      .select("amount, type")
      .eq("driver_id", driver.id)
      .gte("created_at", fromDate);

    const earnings = (periodTotals || [])
      .filter((p) => p.type === "earning" || p.type === "bonus" || p.type === "tip")
      .reduce((sum, p) => sum + (parseFloat(String(p.amount)) || 0), 0);

    const deductions = (periodTotals || [])
      .filter((p) => p.type === "deduction")
      .reduce((sum, p) => sum + (parseFloat(String(p.amount)) || 0), 0);

    // Count deliveries for the period
    const { count: periodDeliveries } = await supabase
      .from("delivery_jobs")
      .select("id", { count: "exact", head: true })
      .eq("driver_id", driver.id)
      .eq("status", "completed")
      .gte("actual_delivery_time", fromDate);

    return NextResponse.json({
      payouts: payouts || [],
      total: count || 0,
      summary: {
        period,
        earnings,
        deductions,
        net: earnings - deductions,
        deliveries: periodDeliveries || 0,
        avg_per_delivery: (periodDeliveries || 0) > 0
          ? earnings / (periodDeliveries || 1)
          : 0,
      },
      lifetime: {
        total_deliveries: driver.total_deliveries || 0,
        total_earnings: parseFloat(String(driver.total_earnings)) || 0,
      },
    }, { headers });
  } catch (err) {
    console.error("Error fetching earnings:", err);
    return NextResponse.json({ error: "Failed to fetch earnings" }, { status: 500, headers });
  }
}
