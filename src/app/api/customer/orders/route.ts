import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateCustomerRequest } from "@/lib/shipping-auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = authenticateCustomerRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const mainKey = process.env.MAIN_SUPABASE_SERVICE_KEY;
  const mainUrl = process.env.MAIN_SUPABASE_URL || "https://akiecgwcxadcpqlvntmf.supabase.co";
  if (!mainKey) return NextResponse.json({ error: "Order history is temporarily unavailable" }, { status: 503 });

  const mainDb = createClient(mainUrl, mainKey, { auth: { persistSession: false } });
  const { data: user, error: userError } = await mainDb.from("users").select("id, status").eq("id", session.sub).maybeSingle();
  if (userError) return NextResponse.json({ error: "Account check unavailable" }, { status: 503 });
  if (!user || String(user.status || "").toUpperCase() !== "ACTIVE") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") || 30);
  const limit = Number.isFinite(requestedLimit) ? Math.min(50, Math.max(1, Math.trunc(requestedLimit))) : 30;
  const { data: wallets, error: walletError } = await mainDb.from("wallets").select("id").eq("user_id", session.sub);
  if (walletError) return NextResponse.json({ error: "Could not load orders" }, { status: 503 });

  let transactions: Array<Record<string, unknown>> = [];
  if (wallets?.length) {
    const result = await mainDb.from("transactions")
      .select("id, amount, currency, status, metadata, created_at")
      .in("wallet_id", wallets.map((wallet) => wallet.id))
      .eq("type", "PURCHASE")
      .filter("metadata->>type", "eq", "store_purchase")
      .order("created_at", { ascending: false }).limit(limit);
    if (result.error) return NextResponse.json({ error: "Could not load orders" }, { status: 503 });
    transactions = result.data || [];
  }

  const { data: jobs, error: jobsError } = await supabase.from("delivery_jobs")
    .select("job_number, status, customer_id, created_at")
    .eq("customer_id", session.sub)
    .order("created_at", { ascending: false }).limit(100);
  if (jobsError) return NextResponse.json({ error: "Could not load deliveries" }, { status: 503 });
  const jobsByNumber = new Map((jobs || []).map((job) => [job.job_number, job]));
  const orders = transactions.map((transaction) => {
    const metadata = (transaction.metadata || {}) as Record<string, unknown>;
    const jobNumber = typeof metadata.shipping_job_number === "string" ? metadata.shipping_job_number : null;
    const shipment = jobNumber ? jobsByNumber.get(jobNumber) : null;
    return {
      transaction_id: transaction.id,
      order_number: typeof metadata.order_number === "string" ? metadata.order_number : null,
      store_name: typeof metadata.store_name === "string" ? metadata.store_name : "Peeap Store",
      amount: Math.abs(Number(transaction.amount || 0)),
      currency: transaction.currency,
      payment_status: transaction.status,
      order_status: transaction.status === "REVERSED" ? "cancelled" : (metadata.order_status || "processing"),
      shipping_job_number: jobNumber,
      shipping_status: shipment?.status || null,
      created_at: transaction.created_at,
    };
  });
  return NextResponse.json({ orders, total: orders.length }, { headers: { "Cache-Control": "private, no-store" } });
}
