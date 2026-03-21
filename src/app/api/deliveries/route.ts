import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authenticateServiceCall } from "@/lib/auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { createDeliveryJobSchema } from "@/lib/validation";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

// GET /api/deliveries — List deliveries (role-based filtering)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const offset = parseInt(searchParams.get("offset") || "0");
    const status = searchParams.get("status");
    const role = searchParams.get("role") || "merchant"; // merchant | driver | customer
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let query = supabase
      .from("delivery_jobs")
      .select("*, driver:drivers(*)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Role-based filtering
    if (role === "driver") {
      // Drivers see only jobs assigned to them
      const { data: driverRecord } = await supabase
        .from("drivers")
        .select("id")
        .eq("user_id", auth.sub)
        .single();

      if (!driverRecord) {
        return NextResponse.json(
          { deliveries: [], total: 0 },
          { headers }
        );
      }
      query = query.eq("driver_id", driverRecord.id);
    } else if (role === "customer") {
      query = query.eq("customer_id", auth.sub);
    } else {
      // merchant: sees jobs where they are the merchant
      query = query.eq("merchant_id", auth.sub);
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (from) {
      query = query.gte("created_at", from);
    }
    if (to) {
      query = query.lte("created_at", `${to}T23:59:59.999Z`);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json(
      { deliveries: data || [], total: count || 0 },
      { headers }
    );
  } catch (err) {
    console.error("Error fetching deliveries:", err);
    return NextResponse.json(
      { error: "Failed to fetch deliveries" },
      { status: 500, headers }
    );
  }
}

// POST /api/deliveries — Create delivery job (service-to-service or authenticated)
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  // Allow service-to-service calls (from store purchase flow) or authenticated users
  const isServiceCall = authenticateServiceCall(request);
  const auth = !isServiceCall ? await authenticateRequest(request) : null;

  if (!isServiceCall && !auth) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers }
    );
  }

  try {
    const body = await request.json();
    const parsed = createDeliveryJobSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400, headers }
      );
    }

    // Generate job number: SHP-YYYYMMDD-XXXX
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const randomSuffix = Math.random()
      .toString(36)
      .substring(2, 6)
      .toUpperCase();
    const jobNumber = `SHP-${dateStr}-${randomSuffix}`;

    const jobData = {
      ...parsed.data,
      job_number: jobNumber,
      status: "pending",
    };

    const { data, error } = await supabase
      .from("delivery_jobs")
      .insert(jobData)
      .select()
      .single();

    if (error) throw error;

    // Create initial tracking update
    await supabase.from("tracking_updates").insert({
      job_id: data.id,
      status: "pending",
      message: "Delivery job created. Awaiting driver assignment.",
      updated_by: auth?.sub || null,
    });

    return NextResponse.json(
      { delivery: data, job_number: jobNumber },
      { status: 201, headers }
    );
  } catch (err) {
    console.error("Error creating delivery job:", err);
    return NextResponse.json(
      { error: "Failed to create delivery job" },
      { status: 500, headers }
    );
  }
}
