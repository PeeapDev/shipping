import { NextRequest, NextResponse } from "next/server";
import { authenticateCustomerRequest } from "@/lib/shipping-auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { jobNumber: string } }) {
  const session = authenticateCustomerRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!/^SHP-[A-Z0-9-]{8,40}$/i.test(params.jobNumber)) return NextResponse.json({ error: "Invalid tracking number" }, { status: 400 });

  // Both predicates are required: a signed-in customer may only see their own job.
  const { data: delivery, error: jobError } = await supabase.from("delivery_jobs")
    .select("id, job_number, status, created_at, estimated_delivery_date, package_description, merchant_name, delivery_city")
    .eq("job_number", params.jobNumber).eq("customer_id", session.sub).maybeSingle();
  if (jobError) return NextResponse.json({ error: "Tracking is temporarily unavailable" }, { status: 503 });
  if (!delivery) return NextResponse.json({ error: "Delivery not found for this account" }, { status: 404 });

  const { data: updates, error: updateError } = await supabase.from("tracking_updates")
    .select("id, status, message, location_name, created_at")
    .eq("job_id", delivery.id).order("created_at", { ascending: false }).limit(50);
  if (updateError) return NextResponse.json({ error: "Tracking updates are temporarily unavailable" }, { status: 503 });
  return NextResponse.json({ delivery: { job_number: delivery.job_number, status: delivery.status, created_at: delivery.created_at, estimated_delivery_date: delivery.estimated_delivery_date, package_description: delivery.package_description, merchant_name: delivery.merchant_name, delivery_city: delivery.delivery_city }, updates: updates || [] }, { headers: { "Cache-Control": "private, no-store" } });
}
