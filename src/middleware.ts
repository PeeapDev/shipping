import { NextRequest, NextResponse } from "next/server";

/**
 * Parse a shipping token (supports both old base64 and new HMAC-signed format).
 * Returns the payload or null if invalid/expired.
 */
function parseToken(token: string): { sub: string; exp: number } | null {
  if (!token.startsWith("shp_")) return null;
  try {
    const raw = token.slice(4); // remove "shp_"
    const dotIndex = raw.lastIndexOf(".");

    // New signed format: shp_<base64url>.<signature>
    if (dotIndex > 0) {
      const encoded = raw.slice(0, dotIndex);
      return JSON.parse(Buffer.from(encoded, "base64url").toString());
    }

    // Legacy format: shp_<base64(json)>
    return JSON.parse(Buffer.from(raw, "base64").toString());
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("peeap_shipping_token")?.value;

  // Protect dashboard routes
  if (pathname.startsWith("/dashboard")) {
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    const payload = parseToken(token);
    if (!payload || (payload.exp && payload.exp < Date.now())) {
      const loginUrl = new URL("/login", request.url);
      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete("peeap_shipping_token");
      return response;
    }
  }

  // If already logged in and visiting /login, redirect to dashboard
  if (pathname === "/login" && token) {
    const payload = parseToken(token);
    if (payload && payload.exp && payload.exp > Date.now()) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
