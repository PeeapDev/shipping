import { NextRequest, NextResponse } from "next/server";

async function validShippingSession(token: string | undefined): Promise<boolean> {
  const secret = process.env.SHIPPING_TOKEN_SECRET || process.env.SERVICE_SECRET;
  if (!secret || !token?.startsWith("shp_")) return false;
  const raw = token.slice(4);
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return false;
  const encoded = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  try {
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const bytes = Uint8Array.from(Buffer.from(signature, "base64url"));
    if (!await crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(encoded))) return false;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
    return typeof payload.sub === "string" && typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const valid = await validShippingSession(request.cookies.get("peeap_shipping_token")?.value);
  if (pathname.startsWith("/dashboard") && !valid) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete("peeap_shipping_token");
    return response;
  }
  if (pathname === "/login" && valid) return NextResponse.redirect(new URL("/dashboard", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/login"] };
