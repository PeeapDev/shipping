import { NextRequest, NextResponse } from "next/server";
import { corsHeaders, handleCORS } from "@/lib/cors";
import { supabase } from "@/lib/supabase";
import { authenticateShippingRequest } from "@/lib/shipping-auth";
import { cityFilterSchema, mergedZonePricing, ZONE_FIELDS, zoneCreateSchema, zoneIdSchema, zoneUpdateSchema } from "@/lib/zone-pricing";
import { auditLog } from "@/lib/rbac";

const zoneColumns = "id,name,city,base_fee,per_km_fee,min_fee,max_fee,estimated_time_minutes,is_active,created_at";

/** Pricing authority comes from the current staff record, not a stale token role. */
async function pricingAdmin(request: NextRequest, headers: Record<string, string>) {
  const auth = authenticateShippingRequest(request);
  if (!auth) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401, headers }) };
  const { data: staff, error } = await supabase.from("shipping_staff").select("role,is_active").eq("user_id", auth.sub).maybeSingle();
  if (error) return { error: NextResponse.json({ error: "Could not verify pricing access" }, { status: 503, headers }) };
  if (staff?.is_active !== true || !["admin", "superadmin"].includes(String(staff.role).toLowerCase())) {
    return { error: NextResponse.json({ error: "Only an active shipping admin can manage pricing" }, { status: 403, headers }) };
  }
  return { auth: { ...auth, role: staff.role } };
}

function writeOriginError(request: NextRequest, headers: Record<string, string>) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Pricing changes must originate from shipping" }, { status: 403, headers });
  }
  return null;
}

export async function OPTIONS(request: NextRequest) {
  return handleCORS(request) || NextResponse.json({});
}

// GET /api/zones — Get delivery zones and pricing (public)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get("city");
    const includeInactive = searchParams.get("all") === "true";
    if (includeInactive) {
      const access = await pricingAdmin(request, headers);
      if (access.error) return access.error;
    }
    const cityResult = city ? cityFilterSchema.safeParse(city) : null;
    if (cityResult && !cityResult.success) return NextResponse.json({ error: "Invalid city filter" }, { status: 400, headers });

    let query = supabase
      .from("delivery_zones")
      .select(zoneColumns)
      .order("city")
      .order("name");

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    if (cityResult?.success) {
      query = query.ilike("city", cityResult.data);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ zones: data || [] }, { headers });
  } catch (err: any) {
    console.error("Error fetching zones:", err);
    return NextResponse.json(
      { error: "Failed to fetch zones" },
      { status: 500, headers }
    );
  }
}

// POST /api/zones — Create a new delivery zone (auth required)
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const originError = writeOriginError(request, headers);
    if (originError) return originError;
    const access = await pricingAdmin(request, headers);
    if (access.error) return access.error;
    const parsed = zoneCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid zone pricing", details: parsed.error.flatten() }, { status: 400, headers });

    const { data, error } = await supabase
      .from("delivery_zones")
      .insert(parsed.data)
      .select(zoneColumns)
      .single();

    if (error || !data) throw error || new Error("Zone creation returned no row");
    auditLog({ actorId: access.auth!.sub, actorRole: access.auth!.role, action: "create_zone_pricing", resourceType: "zone", resourceId: data.id, details: parsed.data });

    return NextResponse.json({ zone: data }, { status: 201, headers });
  } catch (err: any) {
    console.error("Error creating zone:", err);
    return NextResponse.json(
      { error: "Failed to create zone" },
      { status: 500, headers }
    );
  }
}

// PUT /api/zones — Update a delivery zone (auth required)
export async function PUT(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const originError = writeOriginError(request, headers);
    if (originError) return originError;
    const access = await pricingAdmin(request, headers);
    if (access.error) return access.error;
    const parsed = zoneUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid zone update", details: parsed.error.flatten() }, { status: 400, headers });
    const { id, ...updates } = parsed.data;
    const { data: current, error: readError } = await supabase.from("delivery_zones").select(zoneColumns).eq("id", id).maybeSingle();
    if (readError) throw readError;
    if (!current) return NextResponse.json({ error: "Zone not found" }, { status: 404, headers });
    const complete = mergedZonePricing(current, updates);
    if (!complete.success) return NextResponse.json({ error: "Invalid fee range; edit the zone with a consistent minimum, base and maximum", details: complete.error.flatten() }, { status: 400, headers });
    let query = supabase.from("delivery_zones").update(updates).eq("id", id);
    // Optimistic compare-and-swap prevents concurrent partial updates from
    // combining independently valid changes into an invalid fee range.
    for (const field of ZONE_FIELDS) query = current[field] === null ? query.is(field, null) : query.eq(field, current[field]);
    const { data, error } = await query.select(zoneColumns).maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Pricing changed while you were editing. Reload and try again." }, { status: 409, headers });
    auditLog({ actorId: access.auth!.sub, actorRole: access.auth!.role, action: "update_zone_pricing", resourceType: "zone", resourceId: id, details: updates });

    return NextResponse.json({ zone: data }, { headers });
  } catch (err: any) {
    console.error("Error updating zone:", err);
    return NextResponse.json(
      { error: "Failed to update zone" },
      { status: 500, headers }
    );
  }
}

// DELETE /api/zones — Delete a delivery zone (auth required)
export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const originError = writeOriginError(request, headers);
    if (originError) return originError;
    const access = await pricingAdmin(request, headers);
    if (access.error) return access.error;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!zoneIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "A valid zone id is required" }, { status: 400, headers });
    }

    const { data, error } = await supabase
      .from("delivery_zones")
      .delete()
      .eq("id", id)
      .select("id").maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Zone not found" }, { status: 404, headers });
    auditLog({ actorId: access.auth!.sub, actorRole: access.auth!.role, action: "delete_zone_pricing", resourceType: "zone", resourceId: id! });

    return NextResponse.json({ success: true }, { headers });
  } catch (err: any) {
    console.error("Error deleting zone:", err);
    return NextResponse.json(
      { error: "Failed to delete zone" },
      { status: 500, headers }
    );
  }
}
