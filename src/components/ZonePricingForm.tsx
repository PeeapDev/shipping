"use client";

import { useRef, useState } from "react";
import { Save, X } from "lucide-react";
import type { DeliveryZone } from "@/types/shipping";
import { MAX_ZONE_FEE, zonePricingDraft, zonePricingFromDraft, type ZonePricingDraft } from "@/lib/zone-pricing";

export function ZonePricingForm({ zone, onClose, onSaved }: { zone: DeliveryZone | null; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState(() => zonePricingDraft(zone));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const change = (field: keyof ZonePricingDraft, value: string | boolean) => setDraft((current) => ({ ...current, [field]: value }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    const parsed = zonePricingFromDraft(draft);
    if (!parsed.success) { setError(`${parsed.error.issues[0].path.join(" ")}: ${parsed.error.issues[0].message}`); return; }
    busy.current = true;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/zones", { method: zone ? "PUT" : "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(zone ? { id: zone.id, ...parsed.data } : parsed.data) });
      const result = await response.json();
      if (!response.ok || !result.zone) throw new Error(result.error || "Could not save pricing");
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save pricing"); }
    finally { busy.current = false; setSaving(false); }
  }

  return <form onSubmit={(event) => void save(event)} className="rounded-xl border border-violet-200 bg-white p-5 sm:p-6">
    <div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{zone ? "Edit city / zone pricing" : "Add city / zone pricing"}</h2><button type="button" disabled={saving} onClick={onClose} aria-label="Close pricing form" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-medium text-gray-700">City<input required maxLength={100} value={draft.city} onChange={(event) => change("city", event.target.value)} placeholder="e.g. Freetown" className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
      <label className="block text-sm font-medium text-gray-700">Zone name<input required maxLength={100} value={draft.name} onChange={(event) => change("name", event.target.value)} placeholder="e.g. City-wide or East End" className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
    </div>
    <fieldset className="mt-5"><legend className="text-sm font-semibold text-gray-700">Pricing method</legend><div className="mt-2 flex flex-wrap gap-4"><label className="flex items-center gap-2 text-sm"><input type="radio" name="pricing-mode" checked={draft.mode === "flat"} onChange={() => change("mode", "flat")} />Flat fee per city / zone</label><label className="flex items-center gap-2 text-sm"><input type="radio" name="pricing-mode" checked={draft.mode === "distance"} onChange={() => change("mode", "distance")} />Distance-based (advanced)</label></div></fieldset>
    {draft.mode === "flat" ? <div className="mt-4 rounded-xl bg-violet-50 p-4"><label className="block text-sm font-semibold text-violet-900">Flat shipping fee (SLE)<input required type="number" min={0} max={MAX_ZONE_FEE} step="0.01" value={draft.flat_fee} onChange={(event) => change("flat_fee", event.target.value)} placeholder="Enter your fee" className="mt-2 w-full max-w-xs rounded-lg border bg-white px-3 py-2 text-gray-900" /></label><p className="mt-2 text-sm text-violet-800">This amount covers deliveries within the selected city, without a distance or package-size supplement. Cross-city flat pricing requires a separate route rule. Enter 0 only if delivery is intentionally free.</p></div> : <div className="mt-4 grid gap-4 sm:grid-cols-2">{([["base_fee", "Base fee (SLE)"], ["per_km_fee", "Per kilometre (SLE)"], ["min_fee", "Minimum fee (SLE)"], ["max_fee", "Maximum fee (SLE)"]] as const).map(([field, label]) => <label key={field} className="block text-sm font-medium text-gray-700">{label}<input required type="number" min={0} max={MAX_ZONE_FEE} step="0.01" value={draft[field]} onChange={(event) => change(field, event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>)}</div>}
    <div className="mt-5 flex flex-wrap items-end gap-5"><label className="block text-sm font-medium text-gray-700">Estimated delivery time (minutes)<input required type="number" min={1} max={10080} step={1} value={draft.estimated_time_minutes} onChange={(event) => change("estimated_time_minutes", event.target.value)} className="mt-1 w-full max-w-xs rounded-lg border px-3 py-2" /></label><label className="flex items-center gap-2 py-2 text-sm font-medium"><input type="checkbox" checked={draft.is_active} onChange={(event) => change("is_active", event.target.checked)} />Available at checkout</label></div>
    <p className="mt-4 text-sm text-gray-500">Rate changes apply to new quotes. Existing paid orders keep their recorded shipping charge.</p>
    {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <button type="submit" disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "Saving…" : "Save pricing"}</button>
  </form>;
}
