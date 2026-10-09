import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  for (const name of ["peeap_shipping_token", "peeap_shipping_customer_token", "peeap_shipping_user"]) {
    response.cookies.set(name, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  }
  return response;
}
