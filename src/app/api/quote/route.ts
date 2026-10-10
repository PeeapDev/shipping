import { NextRequest, NextResponse } from "next/server";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { quoteRequestSchema } from "@/lib/validation";
import { cityFilterSchema, isFlatZone } from "@/lib/zone-pricing";

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

/**
 * Haversine distance in km between two lat/lng points.
 */
function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Known city coordinates for Sierra Leone (fallback when lat/lng not provided).
 * Extend this as new cities are added.
 */
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  freetown: { lat: 8.484, lng: -13.2299 },
  bo: { lat: 7.9647, lng: -11.7383 },
  kenema: { lat: 7.8767, lng: -11.1875 },
  makeni: { lat: 8.8833, lng: -12.05 },
  koidu: { lat: 8.6436, lng: -10.9717 },
  waterloo: { lat: 8.3389, lng: -13.0714 },
  lunsar: { lat: 8.6833, lng: -12.5333 },
  portloko: { lat: 8.7667, lng: -12.7833 },
  kabala: { lat: 9.5833, lng: -11.55 },
  magburaka: { lat: 8.7167, lng: -11.95 },
  moyamba: { lat: 8.1592, lng: -12.4314 },
  kambia: { lat: 9.1167, lng: -12.9167 },
  // West/East ends of Freetown (for intra-city distance)
  "east freetown": { lat: 8.47, lng: -13.19 },
  "west freetown": { lat: 8.49, lng: -13.28 },
  "central freetown": { lat: 8.484, lng: -13.2299 },
};

function getCityCoords(city: string): { lat: number; lng: number } | null {
  const normalized = city.toLowerCase().trim();
  // Try exact match first
  if (CITY_COORDS[normalized]) return CITY_COORDS[normalized];
  // Try partial match
  for (const [key, coords] of Object.entries(CITY_COORDS)) {
    if (normalized.includes(key) || key.includes(normalized)) return coords;
  }
  return null;
}

// POST /api/quote — Get shipping quote with distance-based pricing
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

    const { pickup_city, delivery_city, package_size, pickup_lat, pickup_lng, delivery_lat, delivery_lng } = parsed.data;
    if (!cityFilterSchema.safeParse(pickup_city).success || !cityFilterSchema.safeParse(delivery_city).success) {
      return NextResponse.json({ error: "invalid_city" }, { status: 400, headers });
    }

    // Exact city matches only. Picking an arbitrary zone or inventing a
    // fallback rate must not silently change what a customer pays.
    const [pickupResult, deliveryResult] = await Promise.all([
      supabase.from("delivery_zones").select("*").ilike("city", pickup_city.trim()).eq("is_active", true).limit(2),
      supabase.from("delivery_zones").select("*").ilike("city", delivery_city.trim()).eq("is_active", true).limit(2),
    ]);
    if (pickupResult.error || deliveryResult.error) throw new Error("zone_lookup_failed");
    if ((pickupResult.data || []).length > 1 || (deliveryResult.data || []).length > 1) {
      return NextResponse.json({ error: "ambiguous_shipping_zone", error_description: "More than one active rate matches this city. Contact shipping support." }, { status: 409, headers });
    }
    const pickupZone = pickupResult.data?.[0];
    const deliveryZone = deliveryResult.data?.[0];
    if (!pickupZone || !deliveryZone) {
      return NextResponse.json({ error: "shipping_route_not_covered" }, { status: 409, headers });
    }
    const sameCity = pickup_city.trim().toLowerCase() === delivery_city.trim().toLowerCase();
    if (isFlatZone(pickupZone) || isFlatZone(deliveryZone)) {
      // A city's flat rate covers deliveries WITHIN that city. Cross-city
      // prices require an explicit business rule, not a guessed multiplier.
      if (!sameCity) return NextResponse.json({ error: "flat_cross_city_rate_not_configured" }, { status: 409, headers });
      return NextResponse.json({ quote: {
        fee: Number(deliveryZone.base_fee), estimated_time_minutes: deliveryZone.estimated_time_minutes,
        distance_km: null, pickup_zone: pickupZone.name, delivery_zone: deliveryZone.name,
        pricing_method: "city_flat", breakdown: { base_fee: Number(deliveryZone.base_fee), per_km_fee: 0, size_multiplier: 1,
          min_fee: Number(deliveryZone.base_fee), max_fee: Number(deliveryZone.base_fee) },
      } }, { headers });
    }

    // Size multiplier
    const sizeMultipliers: Record<string, number> = {
      small: 0.8, medium: 1.0, large: 1.5, extra_large: 2.0,
    };
    const sizeMultiplier = sizeMultipliers[package_size] || 1.0;

    // ── Calculate distance ──
    let distanceKm: number | null = null;

    // Priority 1: Use provided coordinates
    if (pickup_lat != null && pickup_lng != null && delivery_lat != null && delivery_lng != null) {
      distanceKm = haversineKm(pickup_lat, pickup_lng, delivery_lat, delivery_lng);
    }

    // Priority 2: Use city coordinate lookup
    if (distanceKm === null) {
      const pickupCoords = getCityCoords(pickup_city);
      const deliveryCoords = getCityCoords(delivery_city);
      if (pickupCoords && deliveryCoords) {
        distanceKm = haversineKm(pickupCoords.lat, pickupCoords.lng, deliveryCoords.lat, deliveryCoords.lng);
      }
    }

    // ── Calculate fee ──
    const zone = pickupZone || deliveryZone;
    const baseFee = Number(zone.base_fee);
    const perKmFee = Number(zone.per_km_fee);
    const minFee = Number(zone.min_fee);
    const maxFee = Number(zone.max_fee);
    if (![baseFee, perKmFee, minFee, maxFee].every((value) => Number.isFinite(value) && value >= 0) || minFee > maxFee) {
      throw new Error("invalid_zone_pricing");
    }
    let estimatedTime = zone ? (zone.estimated_time_minutes || 60) : 60;

    let fee: number;

    if (distanceKm !== null && distanceKm > 0) {
      // Distance-based pricing: base_fee + (per_km_fee × distance)
      fee = baseFee + (perKmFee * distanceKm);

      // Estimate time: ~25 km/h average speed for motorcycle in Sierra Leone
      const avgSpeedKmh = 25;
      estimatedTime = Math.round((distanceKm / avgSpeedKmh) * 60) + 10; // +10 min for pickup/dropoff

      // If cross-city (different zones), use average of both zone fees
      if (pickupZone && deliveryZone && pickupZone.id !== deliveryZone.id) {
        const avgBase = (parseFloat(String(pickupZone.base_fee)) + parseFloat(String(deliveryZone.base_fee))) / 2;
        const avgPerKm = (parseFloat(String(pickupZone.per_km_fee)) + parseFloat(String(deliveryZone.per_km_fee))) / 2;
        fee = avgBase + (avgPerKm * distanceKm);
      }
    } else {
      // Fallback: zone-based flat fee (no distance data)
      fee = baseFee;
      const isCrossCity = pickup_city.toLowerCase().trim() !== delivery_city.toLowerCase().trim();
      if (isCrossCity) {
        fee *= 1.5;
        estimatedTime *= 1.5;
      }
    }

    // Apply size multiplier
    fee *= sizeMultiplier;

    // Clamp to min/max
    fee = Math.max(minFee, Math.min(fee, maxFee));
    fee = Math.round(fee * 100) / 100;

    return NextResponse.json({
      quote: {
        fee,
        estimated_time_minutes: Math.round(estimatedTime),
        distance_km: distanceKm !== null ? Math.round(distanceKm * 10) / 10 : null,
        pickup_zone: pickupZone?.name || null,
        delivery_zone: deliveryZone?.name || null,
        pricing_method: distanceKm !== null ? "distance" : "zone_flat",
        breakdown: {
          base_fee: baseFee,
          per_km_fee: perKmFee,
          distance_km: distanceKm !== null ? Math.round(distanceKm * 10) / 10 : null,
          size_multiplier: sizeMultiplier,
          min_fee: minFee,
          max_fee: maxFee,
        },
      },
    }, { headers });
  } catch (err) {
    console.error("Error calculating quote:", err);
    return NextResponse.json(
      { error: "Failed to calculate quote" },
      { status: 500, headers }
    );
  }
}
