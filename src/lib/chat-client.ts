/**
 * Chat Client - Sends shipping/delivery updates via chat.peeap.com ecommerce endpoint.
 * All methods are fire-and-forget — they never throw.
 */

const CHAT_API_URL =
  process.env.CHAT_API_URL || "https://chat.peeap.com";
const SERVICE_SECRET = process.env.SERVICE_SECRET || "";

import { retryFetch } from "./retry-fetch";

interface EcommerceMessageParams {
  order_id: string;
  store_id: string;
  buyer_user_id: string;
  seller_user_id: string;
  category: "shipping_update" | "delivery_confirmed" | "driver_assigned";
  content?: string;
  rich_content?: Record<string, unknown>;
  tracking_number?: string;
  driver_user_id?: string;
}

async function sendChatMessage(params: EcommerceMessageParams, label = "chat_message"): Promise<boolean> {
  const res = await retryFetch(
    `${CHAT_API_URL}/api/ecommerce/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Secret": SERVICE_SECRET,
      },
      body: JSON.stringify(params),
    },
    { label: `chat:${label}` }
  );
  return res?.ok ?? false;
}

// ── Seller↔Buyer shipping updates (existing flow) ──

interface ShippingUpdateParams {
  job_number: string;
  store_id: string;
  store_name: string;
  buyer_user_id: string;
  seller_user_id: string;
  new_status: string;
  delivery_address?: string;
  driver_name?: string;
}

export async function sendShippingUpdateToChat(
  params: ShippingUpdateParams
): Promise<boolean> {
  const statusMessages: Record<string, string> = {
    assigned: `A driver${params.driver_name ? ` (${params.driver_name})` : ""} has been assigned to deliver your order from ${params.store_name}.`,
    picked_up: `Your package from ${params.store_name} has been picked up and is on its way!`,
    in_transit: `Your delivery from ${params.store_name} is in transit${params.delivery_address ? ` to ${params.delivery_address}` : ""}.`,
    delivered: `Your order from ${params.store_name} has been delivered! Enjoy your purchase.`,
    completed: `Delivery from ${params.store_name} completed successfully.`,
    cancelled: `Delivery for your order from ${params.store_name} has been cancelled.`,
    failed: `Delivery for your order from ${params.store_name} could not be completed. Please contact the store.`,
  };

  const content = statusMessages[params.new_status];
  if (!content) return false;

  const category = params.new_status === "delivered" || params.new_status === "completed"
    ? "delivery_confirmed"
    : "shipping_update";

  return sendChatMessage({
    order_id: params.job_number,
    store_id: params.store_id,
    buyer_user_id: params.buyer_user_id,
    seller_user_id: params.seller_user_id,
    category,
    content,
    rich_content: {
      job_number: params.job_number,
      store_name: params.store_name,
      new_status: params.new_status,
      driver_name: params.driver_name,
      delivery_address: params.delivery_address,
      tracking_url: `https://shipping.peeap.com/track/${params.job_number}`,
    },
    tracking_number: params.job_number,
  });
}

// ── Driver↔Buyer conversation on assignment ──

interface DriverAssignedParams {
  job_number: string;
  store_id: string;
  store_name: string;
  buyer_user_id: string;
  seller_user_id: string;
  driver_user_id: string;
  driver_name: string;
  driver_phone: string;
  driver_vehicle: string;
  delivery_address?: string;
}

/**
 * Creates a driver↔buyer chat conversation and sends the first message
 * with delivery details. This allows driver and buyer to communicate
 * directly during the delivery.
 */
export async function sendDriverAssignedToChat(
  params: DriverAssignedParams
): Promise<boolean> {
  const content = `Hi! I'm ${params.driver_name}, your delivery driver. I'll be delivering your order from ${params.store_name}${params.delivery_address ? ` to ${params.delivery_address}` : ""}. You can reach me here if you need anything!`;

  return sendChatMessage({
    order_id: params.job_number,
    store_id: params.store_id,
    buyer_user_id: params.buyer_user_id,
    seller_user_id: params.seller_user_id,
    driver_user_id: params.driver_user_id,
    category: "driver_assigned",
    content,
    rich_content: {
      job_number: params.job_number,
      store_name: params.store_name,
      driver_name: params.driver_name,
      driver_phone: params.driver_phone,
      driver_vehicle: params.driver_vehicle,
      delivery_address: params.delivery_address,
      tracking_url: `https://shipping.peeap.com/track/${params.job_number}`,
    },
    tracking_number: params.job_number,
  });
}
