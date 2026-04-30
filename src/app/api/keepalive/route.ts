import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/keepalive — Ping shipping Supabase to prevent free-tier pause
export async function GET() {
  try {
    const { count, error } = await supabase
      .from("delivery_zones")
      .select("id", { count: "exact", head: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      zones: count,
      ts: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
