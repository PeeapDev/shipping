import { NextRequest, NextResponse } from "next/server";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { quoteRequestSchema } from "@/lib/validation";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

// POST /api/quote — Get shipping quote
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const body = await request.json();
    const parsed = quoteRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400, headers }
      );
    }

    const { pickup_city, delivery_city, package_size } = parsed.data;

    // Look up delivery zones for both cities
    const { data: pickupZone } = await supabase
      .from("delivery_zones")
      .select("*")
      .ilike("city", `%${pickup_city}%`)
      .eq("is_active", true)
      .limit(1)
      .single();

    const { data: deliveryZone } = await supabase
      .from("delivery_zones")
      .select("*")
      .ilike("city", `%${delivery_city}%`)
      .eq("is_active", true)
      .limit(1)
      .single();

    // Size multiplier
    const sizeMultipliers: Record<string, number> = {
      small: 0.8,
      medium: 1.0,
      large: 1.5,
      extra_large: 2.0,
    };
    const sizeMultiplier = sizeMultipliers[package_size] || 1.0;

    // Calculate fee
    let baseFee = 10; // Default base fee
    let estimatedTime = 60; // Default 60 minutes

    if (pickupZone && deliveryZone) {
      // Both zones found — use average base fee + inter-zone surcharge
      baseFee =
        (parseFloat(String(pickupZone.base_fee)) +
          parseFloat(String(deliveryZone.base_fee))) /
        2;
      estimatedTime = Math.max(
        pickupZone.estimated_time_minutes || 60,
        deliveryZone.estimated_time_minutes || 60
      );

      // If different cities, add surcharge
      if (
        pickup_city.toLowerCase().trim() !==
        delivery_city.toLowerCase().trim()
      ) {
        baseFee *= 1.5;
        estimatedTime *= 1.5;
      }
    } else if (pickupZone || deliveryZone) {
      const zone = pickupZone || deliveryZone;
      baseFee = parseFloat(String(zone!.base_fee));
      estimatedTime = zone!.estimated_time_minutes || 60;
    }

    const fee = Math.round(baseFee * sizeMultiplier * 100) / 100;

    // Clamp fee within zone limits if available
    const minFee = pickupZone?.min_fee || deliveryZone?.min_fee || 5;
    const maxFee = pickupZone?.max_fee || deliveryZone?.max_fee || 100;
    const clampedFee = Math.max(
      parseFloat(String(minFee)),
      Math.min(fee, parseFloat(String(maxFee)))
    );

    return NextResponse.json(
      {
        quote: {
          fee: clampedFee,
          estimated_time_minutes: Math.round(estimatedTime),
          pickup_zone: pickupZone?.name || null,
          delivery_zone: deliveryZone?.name || null,
        },
      },
      { headers }
    );
  } catch (err) {
    console.error("Error calculating quote:", err);
    return NextResponse.json(
      { error: "Failed to calculate quote" },
      { status: 500, headers }
    );
  }
}
