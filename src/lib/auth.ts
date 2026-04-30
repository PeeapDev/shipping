import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

// Auth — session tokens via main Supabase sso_tokens table. The previous
// strategy-1 (JWT against auth.peeap.com JWKS) was removed because that
// auth service was scoped but never built; the JWKS fetch always timed
// out, adding ~100ms latency to every authenticated request before the
// session-token fallback succeeded.

const MAIN_SUPABASE_URL = process.env.MAIN_SUPABASE_URL || "https://akiecgwcxadcpqlvntmf.supabase.co";
const MAIN_SUPABASE_KEY = process.env.MAIN_SUPABASE_SERVICE_KEY || "";

let _mainDb: ReturnType<typeof createClient> | null = null;

function getMainDb() {
  if (!_mainDb && MAIN_SUPABASE_KEY) {
    _mainDb = createClient(MAIN_SUPABASE_URL, MAIN_SUPABASE_KEY, { auth: { persistSession: false } });
  }
  return _mainDb;
}

export interface AuthPayload {
  sub: string;
  email?: string;
  phone?: string;
  roles: string[];
  client?: string;
}

/**
 * @deprecated Kept as a thin alias so callers importing `validateToken`
 * still link. Prefer `authenticateRequest`.
 */
export async function validateToken(_token: string): Promise<AuthPayload | null> {
  return null;
}

/**
 * Authenticate a request using:
 * 1. Session token from main Supabase sso_tokens table (web SSO)
 * 2. Legacy base64 payload (older mobile clients)
 */
export async function authenticateRequest(
  request: NextRequest
): Promise<AuthPayload | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;

  const token = authHeader.replace(/^(Bearer|Session)\s+/i, "").trim();
  if (!token) return null;

  // 1. Session token from main Supabase
  const mainDb = getMainDb();
  if (mainDb) {
    try {
      const { data: session } = await mainDb
        .from("sso_tokens" as any)
        .select("user_id, expires_at")
        .eq("token", token)
        .maybeSingle() as { data: { user_id: string; expires_at: string } | null };

      if (session) {
        if (new Date(session.expires_at) < new Date()) return null;
        const { data: user } = await mainDb
          .from("users" as any)
          .select("id, email, phone, roles")
          .eq("id", session.user_id)
          .single() as { data: { id: string; email: string; phone: string; roles: string[] } | null };

        if (user) {
          return {
            sub: user.id,
            email: user.email || undefined,
            phone: user.phone || undefined,
            roles: Array.isArray(user.roles) ? user.roles : [],
          };
        }
      }
    } catch {
      // Session lookup failed
    }
  }

  // 2. Legacy base64 payload (older mobile clients)
  try {
    const payload = JSON.parse(Buffer.from(token, "base64").toString());
    if (payload.userId && payload.exp && payload.exp > Date.now()) {
      return { sub: payload.userId, roles: [] };
    }
  } catch {
    // Not a legacy token
  }

  return null;
}

export function authenticateServiceCall(request: NextRequest): boolean {
  const secret = request.headers.get("x-service-secret");
  return !!secret && secret === process.env.SERVICE_SECRET;
}
