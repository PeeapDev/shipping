import { NextRequest, NextResponse } from "next/server";
import { authenticateShippingRequest } from "@/lib/shipping-auth";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";

// CHAT_API may point to a service that's been deleted (chat's Supabase
// project was removed by free-tier auto-cleanup on 2026-04-30). When the
// env var is unset OR points to chat.peeap.com which can't reach a DB,
// every proxied call would hang on a 30s timeout. We short-circuit with
// a 503 so callers see the degraded state immediately. Set CHAT_API_URL
// to the new chat backend once it's back online.
const CHAT_API = process.env.CHAT_API_URL || "";
const CHAT_DISABLED = !CHAT_API;
const SERVICE_SECRET = process.env.SERVICE_SECRET || "";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

/**
 * GET /api/messages — Get all shipping-related conversations
 * Fetches ecommerce_messages from chat service grouped by conversation
 */
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = authenticateShippingRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const { searchParams } = new URL(request.url);
    const jobNumber = searchParams.get("job_number");
    const conversationId = searchParams.get("conversation_id");

    // If requesting messages for a specific job (by job_number)
    if (conversationId) {
      if (CHAT_DISABLED) {
        return NextResponse.json(
          { error: "Chat service unavailable", messages: [], has_more: false },
          { status: 503, headers }
        );
      }
      // conversationId here is actually a job_number — fetch messages from chat
      try {
        const res = await fetch(
          `${CHAT_API}/api/conversations/${conversationId}/messages?limit=50`,
          { headers: { "X-Service-Secret": SERVICE_SECRET }, signal: AbortSignal.timeout(8000) }
        );
        if (res.ok) {
          return NextResponse.json(await res.json(), { headers });
        }
        return NextResponse.json(
          { error: `Chat upstream error ${res.status}`, messages: [], has_more: false },
          { status: 502, headers }
        );
      } catch (e: any) {
        return NextResponse.json(
          { error: `Chat unreachable: ${e?.message || 'timeout'}`, messages: [], has_more: false },
          { status: 502, headers }
        );
      }
    }

    // Get all delivery jobs
    let query = supabase
      .from("delivery_jobs")
      .select("id, job_number, customer_name, customer_id, merchant_id, merchant_name, status, created_at, customer_phone")
      .order("created_at", { ascending: false })
      .limit(50);

    if (jobNumber) {
      query = query.eq("job_number", jobNumber);
    }

    const { data: jobs, error } = await query;
    if (error) throw error;

    return NextResponse.json({ conversations: jobs || [] }, { headers });
  } catch (err) {
    console.error("Error fetching messages:", err);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500, headers });
  }
}

/**
 * POST /api/messages — Send a message in a delivery conversation
 * Proxies to chat.peeap.com ecommerce endpoint
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const auth = authenticateShippingRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const body = await request.json();
    const { job_number, recipient_id, message } = body;

    if (!job_number || !message) {
      return NextResponse.json({ error: "job_number and message are required" }, { status: 400, headers });
    }

    // Get the delivery job to find participants
    const { data: job } = await supabase
      .from("delivery_jobs")
      .select("id, job_number, customer_id, merchant_id, merchant_name, metadata")
      .eq("job_number", job_number)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Delivery not found" }, { status: 404, headers });
    }

    const meta = (job.metadata as Record<string, string>) || {};
    const storeId = meta.store_id || job.merchant_id;

    // Determine who to send to
    const buyerId = recipient_id || job.customer_id;
    const sellerId = job.merchant_id;

    if (CHAT_DISABLED) {
      return NextResponse.json(
        { error: "Chat service unavailable; message not sent" },
        { status: 503, headers }
      );
    }

    // Send via chat ecommerce endpoint
    let chatRes: Response;
    try {
      chatRes = await fetch(`${CHAT_API}/api/ecommerce/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Service-Secret": SERVICE_SECRET },
        body: JSON.stringify({
          order_id: job.job_number,
          store_id: storeId,
          buyer_user_id: buyerId,
          seller_user_id: sellerId,
          category: "shipping_update",
          content: message,
          rich_content: {
            job_number: job.job_number,
            sent_by: "shipping_admin",
            admin_email: auth.email,
          },
          tracking_number: job.job_number,
        }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (e: any) {
      return NextResponse.json(
        { error: `Chat unreachable: ${e?.message || 'timeout'}` },
        { status: 502, headers }
      );
    }

    if (!chatRes.ok) {
      const err = await chatRes.text().catch(() => "Unknown error");
      return NextResponse.json({ error: `Chat error: ${err}` }, { status: 502, headers });
    }

    const result = await chatRes.json();
    return NextResponse.json({ message: result.message, conversation_id: result.conversation_id }, { status: 201, headers });
  } catch (err) {
    console.error("Error sending message:", err);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500, headers });
  }
}
