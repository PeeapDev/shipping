import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

// SHIPPING_TOKEN_SECRET signs HMAC tokens that authenticate shipping
// drivers/admins. There is NO safe default — a hardcoded fallback like
// "peeap-shipping-secret" was previously used, which let anyone with
// access to the public repo forge any user's token. We fail closed if
// the env var is unset.
const TOKEN_SECRET = process.env.SHIPPING_TOKEN_SECRET || process.env.SERVICE_SECRET || "";

if (!TOKEN_SECRET) {
  // Log but don't throw at import — Next.js needs the module to load. The
  // authenticateShippingRequest function refuses all tokens when the
  // secret is empty, so the only effect is that drivers can't sign in
  // until the env var is configured.
  console.error("[shipping-auth] SHIPPING_TOKEN_SECRET / SERVICE_SECRET not set — all shipping auth will fail closed");
}

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

/** Constant-time signature comparison. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * Create a signed shipping token.
 * Format: shp_<base64url(payload)>.<signature>
 */
export function createShippingToken(payload: ShippingAuthPayload): string {
  if (!TOKEN_SECRET) {
    throw new Error("Cannot mint shipping token: SHIPPING_TOKEN_SECRET unset");
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encoded);
  return `shp_${encoded}.${signature}`;
}

/**
 * Authenticate a request using the shipping session token (shp_*).
 * Verifies HMAC signature and expiry.
 * Returns the decoded payload or null if invalid/expired/tampered.
 *
 * Hard-fails any token if TOKEN_SECRET is unset — no default secret.
 * Refuses unsigned tokens (legacy `shp_<base64>` without `.<sig>`) — they
 * were trivial to forge.
 */
export function authenticateShippingRequest(
  request: NextRequest
): ShippingAuthPayload | null {
  if (!TOKEN_SECRET) return null;

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

    // Reject legacy unsigned tokens. They have no `.` separating signature
    // from payload, which means anyone could hand-craft `shp_<json-as-b64>`
    // and become any user. Force re-authentication for any client still
    // holding one of these.
    if (dotIndex === -1) return null;

    const encoded = raw.slice(0, dotIndex);
    const signature = raw.slice(dotIndex + 1);

    // Verify HMAC signature with constant-time comparison
    const expected = sign(encoded);
    if (!safeEqual(signature, expected)) return null;

    const payload: ShippingAuthPayload = JSON.parse(
      Buffer.from(encoded, "base64url").toString()
    );

    if (payload.exp && payload.exp < Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}
