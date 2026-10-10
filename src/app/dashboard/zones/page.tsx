"use client";

import { useEffect, useState } from "react";
import { Map, DollarSign, Clock, MapPin, Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import type { DeliveryZone } from "@/types/shipping";
import { ZonePricingForm } from "@/components/ZonePricingForm";
import { useAuth } from "@/lib/auth-context";
import { isFlatZone } from "@/lib/zone-pricing";

function formatFee(value: unknown) {
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "Not configured";
  return `SLE ${Number(value).toFixed(2)}`;
}

export default function ZonesPage() {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
  const { user } = useAuth();
  const canEdit = !!user && ["admin", "superadmin"].includes(user.role.toLowerCase());
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => { void loadZones(); }, [canEdit]);

  async function loadZones() {
    setLoading(true);
    try {
      const res = await fetch(canEdit ? "/api/zones?all=true" : "/api/zones", { credentials: "same-origin", cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load pricing");
      setZones(data.zones || []);
    } catch (err) {
      console.error("Failed to load zones:", err);
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Could not load pricing" });
    } finally {
      setLoading(false);
    }
  }

  function openCreateForm() {
    setEditingZone(null);
    setShowForm(true);
  }

  function openEditForm(zone: DeliveryZone) {
    setEditingZone(zone);
    setShowForm(true);
  }

  async function handleDelete(zoneId: string) {
    if (!canEdit) return;
    if (!confirm("Delete this zone?")) return;
    try {
      const res = await fetch(`/api/zones?id=${encodeURIComponent(zoneId)}`, { method: "DELETE", credentials: "same-origin" });
      const result = await res.json();
      if (!res.ok || result.success !== true) throw new Error(result.error || "Failed to delete zone");
      setMessage({ type: "success", text: "Zone deleted" });
      void loadZones();
    } catch (cause) {
      setMessage({ type: "error", text: cause instanceof Error ? cause.message : "Failed to delete zone" });
    }
  }

  async function toggleActive(zone: DeliveryZone) {
    if (!canEdit) return;
    try {
      const res = await fetch("/api/zones", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: zone.id, is_active: !zone.is_active }),
      });
      const result = await res.json();
      if (!res.ok || !result.zone) throw new Error(result.error || "Failed to update zone");
      setMessage({ type: "success", text: zone.is_active ? "Pricing disabled" : "Pricing enabled" });
      void loadZones();
    } catch (cause) {
      setMessage({ type: "error", text: cause instanceof Error ? cause.message : "Failed to update zone" });
    }
  }

  const grouped = zones.reduce((acc, zone) => {
    if (!acc[zone.city]) acc[zone.city] = [];
    acc[zone.city].push(zone);
    return acc;
  }, Object.create(null) as Record<string, DeliveryZone[]>);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        {[1, 2, 3].map((i) => (<div key={i} className="h-32 bg-gray-200 rounded-xl" />))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-gray-900">Pricing &amp; zones</h1><p className="mt-1 text-sm text-gray-500">Set the shipping fee charged for a city or selected delivery zone.</p></div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{zones.length} zones</span>
          {canEdit && <button onClick={openCreateForm} className="flex items-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700">
            <Plus className="h-4 w-4" /> Add city / zone fee
          </button>
          }
        </div>
      </div>
      <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900"><strong>Flat fees are available.</strong> Choose Flat fee per city / zone, enter your rate and save. Distance-based rates are kept unchanged unless you explicitly edit them. {!canEdit && <span className="block mt-2">Only an active shipping admin can change pricing.</span>}</div>

      {/* Message */}
      {message && (
        <div role={message.type === "error" ? "alert" : "status"} className={`p-3 rounded-lg text-sm font-medium ${message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}

      {/* Create/Edit Form */}
      {showForm && canEdit && <ZonePricingForm
        key={editingZone?.id || "new"}
        zone={editingZone}
        onClose={() => setShowForm(false)}
        onSaved={() => {
          setMessage({ type: "success", text: editingZone ? "Pricing updated" : "Pricing created" });
          setShowForm(false);
          void loadZones();
        }}
      />}

      {/* Zones grouped by city */}
      {Object.entries(grouped).map(([city, cityZones]) => (
        <div key={city}>
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="h-5 w-5 text-violet-600" />
            <h2 className="text-lg font-semibold text-gray-900">{city}</h2>
            <span className="text-sm text-gray-400">({cityZones.length} zones)</span>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cityZones.map((zone) => (
              <div key={zone.id} className={`bg-white rounded-xl border p-5 ${zone.is_active ? "border-gray-200" : "border-gray-200 opacity-60"}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
                      <Map className="h-5 w-5 text-violet-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{zone.name}</h3>
                      <span className={`text-xs font-medium ${zone.is_active ? "text-green-600" : "text-gray-400"}`}>
                        {zone.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                  {canEdit && <div className="flex items-center gap-1">
                    <button onClick={() => toggleActive(zone)} className="p-1.5 text-gray-400 hover:text-violet-600" title={zone.is_active ? "Deactivate" : "Activate"}>
                      {zone.is_active ? <ToggleRight className="h-5 w-5 text-green-500" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <button onClick={() => openEditForm(zone)} className="p-1.5 text-gray-400 hover:text-violet-600" title="Edit pricing"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => handleDelete(zone.id)} className="p-1.5 text-gray-400 hover:text-red-500" title="Delete"><Trash2 className="h-4 w-4" /></button>
                  </div>}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5" />{isFlatZone(zone) ? "Flat city / zone fee" : "Base fee"}</span>
                    <span className="font-medium text-gray-900">{formatFee(zone.base_fee)}</span>
                  </div>
                  {!isFlatZone(zone) && <><div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Per KM</span>
                    <span className="font-medium text-gray-900">{formatFee(zone.per_km_fee)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Fee Range</span>
                    <span className="text-gray-600">{formatFee(zone.min_fee)} – {formatFee(zone.max_fee)}</span>
                  </div></>}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Est. Time</span>
                    <span className="font-medium text-gray-900">{zone.estimated_time_minutes} min</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {zones.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Map className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No delivery zones yet</p>
          {canEdit && <button onClick={openCreateForm} className="mt-2 text-violet-600 font-medium text-sm hover:underline">Add your first city / zone fee</button>}
        </div>
      )}
    </div>
  );
}
