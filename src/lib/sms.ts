/**
 * SMS Service — sends SMS notifications for verification codes and status updates.
 * Uses a generic HTTP API approach that works with Africa's Talking, Twilio, etc.
 * All methods are fire-and-forget — they never throw.
 */

const SMS_API_URL = process.env.SMS_API_URL || "";
const SMS_API_KEY = process.env.SMS_API_KEY || "";
const SMS_SENDER_ID = process.env.SMS_SENDER_ID || "Peeap";
const SMS_ENABLED = !!SMS_API_URL && !!SMS_API_KEY;

interface SendSmsParams {
  to: string;       // phone number (e.g. +23276123456)
  message: string;
}

async function sendSms(params: SendSmsParams): Promise<boolean> {
  if (!SMS_ENABLED) {
    console.log(`[SMS] Disabled. Would send to ${params.to}: ${params.message}`);
    return false;
  }

  try {
    const res = await fetch(SMS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SMS_API_KEY}`,
      },
      body: JSON.stringify({
        to: params.to,
        message: params.message,
        from: SMS_SENDER_ID,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error("[SMS] Failed:", err);
    return false;
  }
}

// ── Pre-built SMS templates ──

export function sendPickupCodeSms(phone: string, code: string, jobNumber: string): void {
  sendSms({
    to: phone,
    message: `Peeap Shipping: A rider is coming to pick up order ${jobNumber}. Your pickup code is ${code}. Give this to the rider.`,
  }).catch(() => {});
}

export function sendDeliveryCodeSms(phone: string, code: string, storeName: string, estimatedDate: string): void {
  sendSms({
    to: phone,
    message: `Peeap Shipping: Your order from ${storeName} is being shipped! Your delivery code is ${code}. Expected: ${estimatedDate}. Show this code to the rider.`,
  }).catch(() => {});
}

export function sendDriverAssignedSms(phone: string, driverName: string, jobNumber: string): void {
  sendSms({
    to: phone,
    message: `Peeap Shipping: Driver ${driverName} has been assigned to your delivery ${jobNumber}. Track at shipping.peeap.com/track/${jobNumber}`,
  }).catch(() => {});
}

export function sendDeliveryCompleteSms(phone: string, jobNumber: string): void {
  sendSms({
    to: phone,
    message: `Peeap Shipping: Your delivery ${jobNumber} has been completed! Thank you for using Peeap.`,
  }).catch(() => {});
}

export function sendStaffInviteSms(phone: string, inviterName: string): void {
  sendSms({
    to: phone,
    message: `${inviterName} invited you to join Peeap Shipping as staff. Open my.peeap.com to accept or decline.`,
  }).catch(() => {});
}

export function sendReturnNotifySms(phone: string, jobNumber: string, reason: string): void {
  sendSms({
    to: phone,
    message: `Peeap Shipping: Delivery ${jobNumber} is being returned. Reason: ${reason}. A refund will be processed.`,
  }).catch(() => {});
}
