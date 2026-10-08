/**
 * Status Webhook — Notifies the main API (api.peeap.com) when delivery status changes.
 * This keeps the order page in sync with shipping status.
 * Uses retryFetch for reliability — retries up to 3 times on failure.
 */

import { retryFetch } from "./retry-fetch";
import { supabase } from "./supabase";

const MAIN_API = process.env.MAIN_API_URL || "https://api.peeap.com";
const STORE_API = process.env.STORE_API_URL || "https://store.peeap.com";
const SERVICE_SECRET = process.env.SERVICE_SECRET || "";

/**
 * Notify both the main API and POS about a delivery status change.
 * Main API: updates transaction status on my.peeap.com
 * POS API: updates store_orders status on store.peeap.com
 */
export async function notifyStatusChange(params: {
  job_number: string;
  store_order_id?: string | null;
  new_status: string;
  pickup_verified?: boolean;
  delivery_verified?: boolean;
}): Promise<void> {
  if (!SERVICE_SECRET) return;
  {
    const { data: job, error } = await supabase.from("delivery_jobs")
      .select("transaction_id, store_order_id")
      .eq("job_number", params.job_number).maybeSingle();
    if (error) {
      console.error("[ShippingStatus] Could not resolve transaction:", error);
      return;
    }
    const payload = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Secret": SERVICE_SECRET,
      },
      body: JSON.stringify({ ...params, transaction_id: job?.transaction_id || null,
        store_order_id: job?.store_order_id || params.store_order_id || null }),
    };
    await Promise.all([
      retryFetch(`${MAIN_API}/api/shipping/status-update`, payload,
        { label: `webhook:main_${params.new_status}` }),
      retryFetch(`${STORE_API}/api/shipping/status-update`, payload,
        { label: `webhook:pos_${params.new_status}` }),
    ]);
  }
}
