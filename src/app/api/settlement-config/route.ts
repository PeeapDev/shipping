import { NextRequest, NextResponse } from "next/server";
import { authenticateServiceCall } from "@/lib/auth";
import { getShippingSettlement, SettlementConfigError } from "@/lib/settlement-config";

export const dynamic = "force-dynamic";

/** Internal beneficiary preflight. A browser/staff session is not S2S authority. */
export async function GET(request: NextRequest) {
  if (!authenticateServiceCall(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await getShippingSettlement(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SettlementConfigError) {
      return NextResponse.json({ error: error.code, error_description: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "shipping_settlement_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
