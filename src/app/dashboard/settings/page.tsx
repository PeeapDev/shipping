"use client";

import { useEffect, useState } from "react";
import { Save, DollarSign, Target, Building2 } from "lucide-react";

function getToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|; )peeap_shipping_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
  return "";
}

const defaultSettings: Record<string, number> = {
  dispatch_radius_km: 10,
  offer_timeout_seconds: 60,
  max_dispatch_attempts: 3,
  platform_fee_pct: 20,
  driver_payout_pct: 80,
  min_driver_rating: 3.0,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState(defaultSettings);
  const [companyUserId, setCompanyUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => { loadSettings(); }, []);
  useEffect(() => { if (message) { const t = setTimeout(() => setMessage(null), 3000); return () => clearTimeout(t); } }, [message]);

  async function loadSettings() {
    try {
      const token = getToken();
      const res = await fetch("/api/settings", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const s = data.settings || {};
        setSettings({
          dispatch_radius_km: parseFloat(s.dispatch_radius_km) || defaultSettings.dispatch_radius_km,
          offer_timeout_seconds: parseFloat(s.offer_timeout_seconds) || defaultSettings.offer_timeout_seconds,
          max_dispatch_attempts: parseFloat(s.max_dispatch_attempts) || defaultSettings.max_dispatch_attempts,
          platform_fee_pct: parseFloat(s.platform_fee_pct) || defaultSettings.platform_fee_pct,
          driver_payout_pct: parseFloat(s.driver_payout_pct) || defaultSettings.driver_payout_pct,
          min_driver_rating: parseFloat(s.min_driver_rating) || defaultSettings.min_driver_rating,
        });
        // Load company owner ID
        if (s.shipping_company_user_id) {
          const uid = String(s.shipping_company_user_id).replace(/"/g, "");
          setCompanyUserId(uid);
        }
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const token = getToken();
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          settings: {
            ...settings,
            ...(companyUserId.trim() ? { shipping_company_user_id: companyUserId.trim() } : {}),
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error);
      }

      setMessage({ type: "success", text: "Settings saved successfully" });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to save settings" });
    } finally {
      setSaving(false);
    }
  }

  function updateSetting(key: string, value: number) {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "platform_fee_pct") next.driver_payout_pct = 100 - value;
      if (key === "driver_payout_pct") next.platform_fee_pct = 100 - value;
      return next;
    });
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        {[1, 2, 3].map((i) => (<div key={i} className="h-40 bg-gray-200 rounded-xl" />))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-violet-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50">
          <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm font-medium ${message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}

      {/* Dispatch Settings */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
            <Target className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Auto-Dispatch</h2>
            <p className="text-sm text-gray-500">Configure how jobs are offered to drivers</p>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Radius (km)</label>
            <input type="number" value={settings.dispatch_radius_km} onChange={(e) => updateSetting("dispatch_radius_km", parseFloat(e.target.value) || 0)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <p className="text-xs text-gray-400 mt-1">Max distance to search for available drivers</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Offer Timeout (seconds)</label>
            <input type="number" value={settings.offer_timeout_seconds} onChange={(e) => updateSetting("offer_timeout_seconds", parseInt(e.target.value) || 60)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <p className="text-xs text-gray-400 mt-1">Time before offer expires and goes to next driver</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Attempts</label>
            <input type="number" value={settings.max_dispatch_attempts} onChange={(e) => updateSetting("max_dispatch_attempts", parseInt(e.target.value) || 3)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <p className="text-xs text-gray-400 mt-1">Max drivers to offer before flagging for manual dispatch</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min Driver Rating</label>
            <input type="number" step="0.1" value={settings.min_driver_rating} onChange={(e) => updateSetting("min_driver_rating", parseFloat(e.target.value) || 0)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <p className="text-xs text-gray-400 mt-1">Minimum rating for auto-dispatch eligibility</p>
          </div>
        </div>
      </div>

      {/* Financial Settings */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Fee Split</h2>
            <p className="text-sm text-gray-500">How delivery fees are split between platform and drivers</p>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Platform Fee (%)</label>
            <input type="number" min={0} max={100} value={settings.platform_fee_pct} onChange={(e) => updateSetting("platform_fee_pct", parseFloat(e.target.value) || 0)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Driver Payout (%)</label>
            <input type="number" min={0} max={100} value={settings.driver_payout_pct} onChange={(e) => updateSetting("driver_payout_pct", parseFloat(e.target.value) || 0)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">
            On a <strong>Le 100</strong> delivery: Platform gets <strong>Le {settings.platform_fee_pct.toFixed(0)}</strong>, Driver gets <strong>Le {settings.driver_payout_pct.toFixed(0)}</strong>
          </p>
        </div>
      </div>

      {/* Company Owner */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Building2 className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Company Wallet Owner</h2>
            <p className="text-sm text-gray-500">The Peeap user whose wallet receives shipping fees from orders. Change this when transferring management.</p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Owner User ID</label>
          <input
            type="text"
            value={companyUserId}
            onChange={(e) => setCompanyUserId(e.target.value)}
            placeholder="e.g. eb975af4-29ea-4deb-ab1a-538826d9af7b"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
          />
          <p className="text-xs text-gray-400 mt-1">
            This user&apos;s primary wallet will receive all shipping fees. Shipping staff salaries can be paid from this wallet.
          </p>
        </div>
        {companyUserId && (
          <div className="mt-3 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              Shipping fees from all orders will be credited to wallet of user <span className="font-mono text-xs">{companyUserId.slice(0, 8)}...{companyUserId.slice(-4)}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
