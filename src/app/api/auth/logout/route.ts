import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set("peeap_shipping_token", "", { path: "/", maxAge: 0 });
  response.cookies.set("peeap_shipping_user", "", { path: "/", maxAge: 0 });
  return response;
}
