/**
 * Status Webhook — Notifies the main API (api.peeap.com) when delivery status changes.
 * This keeps the order page in sync with shipping status.
 * Uses retryFetch for reliability — retries up to 3 times on failure.
 */

import { retryFetch } from "./retry-fetch";

const MAIN_API = process.env.MAIN_API_URL || "https://api.peeap.com";
const STORE_API = process.env.STORE_API_URL || "https://store.peeap.com";
const SERVICE_SECRET = process.env.SERVICE_SECRET || "";

/**
 * Notify both the main API and POS about a delivery status change.
 * Main API: updates transaction status on my.peeap.com
 * POS API: updates store_orders status on store.peeap.com
 */
export function notifyStatusChange(params: {
  job_number: string;
  store_order_id?: string | null;
  new_status: string;
  pickup_verified?: boolean;
  delivery_verified?: boolean;
}): void {
  if (!SERVICE_SECRET) return;

  const payload = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Service-Secret": SERVICE_SECRET,
    },
    body: JSON.stringify(params),
  };

  // Notify main API (my.peeap.com / api.peeap.com)
  retryFetch(
    `${MAIN_API}/api/shipping/status-update`,
    payload,
    { label: `webhook:main_${params.new_status}` }
  );

  // Notify POS (store.peeap.com) — keeps store_orders in sync
  retryFetch(
    `${STORE_API}/api/shipping/status-update`,
    payload,
    { label: `webhook:pos_${params.new_status}` }
  );
}
