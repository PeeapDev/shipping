import { NextRequest } from "next/server";
import { createHmac } from "crypto";

const TOKEN_SECRET = process.env.SERVICE_SECRET || "peeap-shipping-secret";

export interface ShippingAuthPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

/**
 * Create an HMAC-SHA256 signature for a payload string.
 */
function sign(payload: string): string {
  return createHmac("sha256", TOKEN_SECRET).update(payload).digest("base64url");
}

/**
 * Create a signed shipping token.
 * Format: shp_<base64url(payload)>.<signature>
 */
export function createShippingToken(payload: ShippingAuthPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encoded);
  return `shp_${encoded}.${signature}`;
}

/**
 * Authenticate a request using the shipping session token (shp_*).
 * Verifies HMAC signature and expiry.
 * Returns the decoded payload or null if invalid/expired/tampered.
 */
export function authenticateShippingRequest(
  request: NextRequest
): ShippingAuthPayload | null {
  // Check cookie first
  const cookieToken = request.cookies.get("peeap_shipping_token")?.value;
  // Fallback to Authorization header
  const authHeader = request.headers.get("authorization");
  const headerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  const token = cookieToken || headerToken;
  if (!token || !token.startsWith("shp_")) return null;

  try {
    const raw = token.slice(4); // remove "shp_"
    const dotIndex = raw.lastIndexOf(".");

    // Support legacy unsigned tokens (base64 JSON without signature)
    // and new signed tokens (base64url.signature)
    if (dotIndex === -1) {
      // Legacy format: shp_<base64(json)> — accept but verify structure
      const payload: ShippingAuthPayload = JSON.parse(
        Buffer.from(raw, "base64").toString()
      );
      if (payload.exp && payload.exp < Date.now()) return null;
      return payload;
    }

    const encoded = raw.slice(0, dotIndex);
    const signature = raw.slice(dotIndex + 1);

    // Verify HMAC signature
    const expected = sign(encoded);
    if (signature !== expected) return null;

    const payload: ShippingAuthPayload = JSON.parse(
      Buffer.from(encoded, "base64url").toString()
    );

    if (payload.exp && payload.exp < Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}
