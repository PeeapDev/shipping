/**
 * Push Notification Service — sends FCM push notifications to drivers.
 * Uses FCM HTTP v1 API or legacy API depending on config.
 * All methods are fire-and-forget.
 */

const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY || "";
const FCM_ENABLED = !!FCM_SERVER_KEY;

interface PushPayload {
  token: string;     // driver's FCM token
  title: string;
  body: string;
  data?: Record<string, string>;
}

async function sendPush(payload: PushPayload): Promise<boolean> {
  if (!FCM_ENABLED || !payload.token) return false;

  try {
    const res = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `key=${FCM_SERVER_KEY}`,
      },
      body: JSON.stringify({
        to: payload.token,
        notification: {
          title: payload.title,
          body: payload.body,
          sound: "default",
          click_action: "FLUTTER_NOTIFICATION_CLICK",
        },
        data: payload.data || {},
        priority: "high",
      }),
    });
    return res.ok;
  } catch (err) {
    console.error("[FCM] Push failed:", err);
    return false;
  }
}

// ── Pre-built push templates ──

import { supabase } from "./supabase";

/** Get driver's FCM token from DB */
async function getDriverFcmToken(driverId: string): Promise<string | null> {
  const { data } = await supabase
    .from("drivers")
    .select("fcm_token")
    .eq("id", driverId)
    .single();
  return data?.fcm_token || null;
}

export async function pushNewJobOffer(driverId: string, jobNumber: string, fee: number): Promise<void> {
  const token = await getDriverFcmToken(driverId);
  if (!token) return;
  sendPush({
    token,
    title: "New Delivery Job!",
    body: `Job ${jobNumber} — NLe ${fee.toFixed(0)}. Tap to accept.`,
    data: { type: "job_offer", job_number: jobNumber },
  }).catch(() => {});
}

export async function pushJobAssigned(driverId: string, jobNumber: string): Promise<void> {
  const token = await getDriverFcmToken(driverId);
  if (!token) return;
  sendPush({
    token,
    title: "Job Accepted",
    body: `You've been assigned to delivery ${jobNumber}. Head to the pickup location.`,
    data: { type: "job_assigned", job_number: jobNumber },
  }).catch(() => {});
}

export async function pushStatusUpdate(driverId: string, jobNumber: string, status: string): Promise<void> {
  const token = await getDriverFcmToken(driverId);
  if (!token) return;

  const messages: Record<string, string> = {
    picked_up: "Pickup confirmed. Start delivery now.",
    in_transit: "Package in transit.",
    completed: "Delivery completed! Earnings added to your wallet.",
    returning: "Return initiated. Head back to vendor.",
  };

  sendPush({
    token,
    title: `Delivery ${jobNumber}`,
    body: messages[status] || `Status: ${status}`,
    data: { type: "status_update", job_number: jobNumber, status },
  }).catch(() => {});
}
