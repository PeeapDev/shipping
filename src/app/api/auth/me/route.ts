import { NextRequest, NextResponse } from "next/server";
import { authenticateShippingRequest } from "@/lib/shipping-auth";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const session = authenticateShippingRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: staff, error } = await supabase.from("shipping_staff")
    .select("name, role, is_active")
    .eq("user_id", session.sub).maybeSingle();
  if (error || !staff?.is_active) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    user: { id: session.sub, email: session.email, name: staff.name, role: staff.role },
  });
}
