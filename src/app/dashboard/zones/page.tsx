"use client";

import { useEffect, useState } from "react";
import { Map, DollarSign, Clock, MapPin, Plus, Pencil, Trash2, X, Save, ToggleLeft, ToggleRight } from "lucide-react";
import type { DeliveryZone } from "@/types/shipping";

function getToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|; )peeap_shipping_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
  return "";
}

const emptyZone = {
  name: "", city: "", base_fee: 5, per_km_fee: 2, min_fee: 3, max_fee: 50,
  estimated_time_minutes: 45, is_active: true,
};

export default function ZonesPage() {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
  const [form, setForm] = useState(emptyZone);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => { loadZones(); }, []);
  useEffect(() => { if (message) { const t = setTimeout(() => setMessage(null), 3000); return () => clearTimeout(t); } }, [message]);

  async function loadZones() {
    setLoading(true);
    try {
      const res = await fetch("/api/zones?all=true");
      if (res.ok) {
        const data = await res.json();
        setZones(data.zones || []);
      }
    } catch (err) {
      console.error("Failed to load zones:", err);
    } finally {
      setLoading(false);
    }
  }

  function openCreateForm() {
    setEditingZone(null);
    setForm(emptyZone);
    setShowForm(true);
  }

  function openEditForm(zone: DeliveryZone) {
    setEditingZone(zone);
    setForm({
      name: zone.name, city: zone.city, base_fee: zone.base_fee,
      per_km_fee: zone.per_km_fee, min_fee: zone.min_fee, max_fee: zone.max_fee,
      estimated_time_minutes: zone.estimated_time_minutes, is_active: zone.is_active,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name || !form.city) {
      setMessage({ type: "error", text: "Name and city are required" });
      return;
    }
    setSaving(true);
    try {
      const token = getToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const url = "/api/zones";
      const method = editingZone ? "PUT" : "POST";
      const body = editingZone ? { id: editingZone.id, ...form } : form;

      const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error);
      }

      setMessage({ type: "success", text: editingZone ? "Zone updated" : "Zone created" });
      setShowForm(false);
      loadZones();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to save zone" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(zoneId: string) {
    if (!confirm("Delete this zone?")) return;
    try {
      const token = getToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`/api/zones?id=${zoneId}`, { method: "DELETE", headers });
      if (res.ok) {
        setMessage({ type: "success", text: "Zone deleted" });
        loadZones();
      }
    } catch {
      setMessage({ type: "error", text: "Failed to delete zone" });
    }
  }

  async function toggleActive(zone: DeliveryZone) {
    try {
      const token = getToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      await fetch("/api/zones", {
        method: "PUT",
        headers,
        body: JSON.stringify({ id: zone.id, is_active: !zone.is_active }),
      });
      loadZones();
    } catch {
      setMessage({ type: "error", text: "Failed to update zone" });
    }
  }

  const grouped = zones.reduce((acc, zone) => {
    if (!acc[zone.city]) acc[zone.city] = [];
    acc[zone.city].push(zone);
    return acc;
  }, {} as Record<string, DeliveryZone[]>);

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Delivery Zones</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{zones.length} zones</span>
          <button onClick={openCreateForm} className="flex items-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700">
            <Plus className="h-4 w-4" /> Add Zone
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-3 rounded-lg text-sm font-medium ${message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}

      {/* Create/Edit Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{editingZone ? "Edit Zone" : "Create Zone"}</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Zone name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
              <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="City" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Base Fee (Le)</label>
              <input type="number" value={form.base_fee} onChange={(e) => setForm({ ...form, base_fee: parseFloat(e.target.value) || 0 })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Per KM Fee (Le)</label>
              <input type="number" value={form.per_km_fee} onChange={(e) => setForm({ ...form, per_km_fee: parseFloat(e.target.value) || 0 })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Fee (Le)</label>
              <input type="number" value={form.min_fee} onChange={(e) => setForm({ ...form, min_fee: parseFloat(e.target.value) || 0 })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Fee (Le)</label>
              <input type="number" value={form.max_fee} onChange={(e) => setForm({ ...form, max_fee: parseFloat(e.target.value) || 0 })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Est. Time (min)</label>
              <input type="number" value={form.estimated_time_minutes} onChange={(e) => setForm({ ...form, estimated_time_minutes: parseInt(e.target.value) || 0 })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex items-end">
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-violet-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50">
                <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <div className="flex items-center gap-1">
                    <button onClick={() => toggleActive(zone)} className="p-1.5 text-gray-400 hover:text-violet-600" title={zone.is_active ? "Deactivate" : "Activate"}>
                      {zone.is_active ? <ToggleRight className="h-5 w-5 text-green-500" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <button onClick={() => openEditForm(zone)} className="p-1.5 text-gray-400 hover:text-violet-600" title="Edit"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => handleDelete(zone.id)} className="p-1.5 text-gray-400 hover:text-red-500" title="Delete"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5" />Base Fee</span>
                    <span className="font-medium text-gray-900">Le {zone.base_fee.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Per KM</span>
                    <span className="font-medium text-gray-900">Le {zone.per_km_fee.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Fee Range</span>
                    <span className="text-gray-600">Le {zone.min_fee.toFixed(2)} - Le {zone.max_fee.toFixed(2)}</span>
                  </div>
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
          <button onClick={openCreateForm} className="mt-2 text-violet-600 font-medium text-sm hover:underline">Create your first zone</button>
        </div>
      )}
    </div>
  );
}
