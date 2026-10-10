import { z } from "zod";

export const MAX_ZONE_FEE = 1_000_000;
export const ZONE_FIELDS = ["name", "city", "base_fee", "per_km_fee", "min_fee", "max_fee", "estimated_time_minutes", "is_active"] as const;
const label = z.string().trim().min(1).max(100).regex(/^[^\u0000-\u001f\u007f%_\\]+$/, "Names cannot contain control characters or search wildcards");
const fee = z.number().finite().min(0).max(MAX_ZONE_FEE).multipleOf(0.01);
const fields = z.object({
  name: label,
  city: label,
  base_fee: fee,
  per_km_fee: fee,
  min_fee: fee,
  max_fee: fee,
  estimated_time_minutes: z.number().finite().int().min(1).max(10080),
  is_active: z.boolean(),
}).strict();

export const zoneCreateSchema = fields.superRefine((zone, context) => {
  if (zone.min_fee > zone.max_fee) context.addIssue({ code: z.ZodIssueCode.custom, path: ["min_fee"], message: "Minimum fee cannot exceed maximum fee" });
  if (zone.base_fee < zone.min_fee || zone.base_fee > zone.max_fee) context.addIssue({ code: z.ZodIssueCode.custom, path: ["base_fee"], message: "Base fee must be between minimum and maximum fees" });
});
export const zoneUpdateSchema = fields.partial().extend({ id: z.string().uuid() }).strict()
  .refine((body) => Object.keys(body).length > 1, "Provide at least one field to update");
export const zoneIdSchema = z.string().uuid();
export const cityFilterSchema = label;
export type ZonePricingInput = z.infer<typeof zoneCreateSchema>;

/** The existing columns encode a true flat rate without introducing a schema. */
export function flatZonePrice(feeAmount: number) {
  return { base_fee: feeAmount, per_km_fee: 0, min_fee: feeAmount, max_fee: feeAmount };
}

export function isFlatZone(zone: Pick<ZonePricingInput, "base_fee" | "per_km_fee" | "min_fee" | "max_fee">): boolean {
  const values: unknown[] = [zone.base_fee, zone.per_km_fee, zone.min_fee, zone.max_fee];
  if (values.some((value) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)))) return false;
  return Number(zone.per_km_fee) === 0 && Number(zone.min_fee) === Number(zone.base_fee) && Number(zone.max_fee) === Number(zone.base_fee);
}

/** Numeric strings may come from PostgreSQL; browser updates never get coerced. */
export function mergedZonePricing(stored: Record<string, unknown>, updates: Record<string, unknown>) {
  const complete = Object.fromEntries(ZONE_FIELDS.map((field) => [field, stored[field]]));
  for (const field of ["base_fee", "per_km_fee", "min_fee", "max_fee", "estimated_time_minutes"]) {
    const value = complete[field];
    if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value)) complete[field] = Number(value);
  }
  return zoneCreateSchema.safeParse({ ...complete, ...updates });
}

export type ZonePricingDraft = {
  mode: "flat" | "distance"; name: string; city: string; flat_fee: string;
  base_fee: string; per_km_fee: string; min_fee: string; max_fee: string;
  estimated_time_minutes: string; is_active: boolean;
};

export function zonePricingDraft(zone?: ZonePricingInput | null): ZonePricingDraft {
  return {
    mode: !zone || isFlatZone(zone) ? "flat" : "distance",
    name: zone?.name || "", city: zone?.city || "", flat_fee: zone ? String(zone.base_fee) : "",
    base_fee: zone ? String(zone.base_fee) : "", per_km_fee: zone ? String(zone.per_km_fee) : "",
    min_fee: zone ? String(zone.min_fee) : "", max_fee: zone ? String(zone.max_fee) : "",
    estimated_time_minutes: String(zone?.estimated_time_minutes || 60), is_active: zone?.is_active ?? true,
  };
}

/** Empty inputs are invalid, not accidentally free shipping. */
export function zonePricingFromDraft(draft: ZonePricingDraft) {
  const number = (value: string) => value.trim() ? Number(value) : NaN;
  const pricing = draft.mode === "flat" ? flatZonePrice(number(draft.flat_fee)) : {
    base_fee: number(draft.base_fee), per_km_fee: number(draft.per_km_fee), min_fee: number(draft.min_fee), max_fee: number(draft.max_fee),
  };
  return zoneCreateSchema.safeParse({ name: draft.name, city: draft.city, ...pricing, estimated_time_minutes: number(draft.estimated_time_minutes), is_active: draft.is_active });
}
