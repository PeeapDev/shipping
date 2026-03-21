"use client";

import { useState } from "react";
import { Settings, Save, Bell, Globe, DollarSign, Truck } from "lucide-react";

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    auto_assign_drivers: true,
    default_platform_fee_percent: 20,
    max_delivery_radius_km: 50,
    require_proof_of_delivery: false,
    notify_on_status_change: true,
    notify_driver_on_new_job: true,
    default_estimated_time_minutes: 60,
    currency: "SLE",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      // In production, save to API
      await new Promise((r) => setTimeout(r, 500));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* Delivery Settings */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-5 border-b border-gray-200 flex items-center gap-2">
          <Truck className="h-5 w-5 text-violet-600" />
          <h2 className="font-semibold text-gray-900">Delivery Settings</h2>
        </div>
        <div className="p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900 text-sm">
                Auto-Assign Drivers
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                Automatically assign nearest available driver to new jobs
              </div>
            </div>
            <button
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  auto_assign_drivers: !s.auto_assign_drivers,
                }))
              }
              className={`w-11 h-6 rounded-full transition-colors ${
                settings.auto_assign_drivers ? "bg-violet-600" : "bg-gray-300"
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                  settings.auto_assign_drivers
                    ? "translate-x-5.5 ml-[22px]"
                    : "translate-x-0.5 ml-[2px]"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900 text-sm">
                Require Proof of Delivery
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                Drivers must upload a photo before marking as delivered
              </div>
            </div>
            <button
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  require_proof_of_delivery: !s.require_proof_of_delivery,
                }))
              }
              className={`w-11 h-6 rounded-full transition-colors ${
                settings.require_proof_of_delivery
                  ? "bg-violet-600"
                  : "bg-gray-300"
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                  settings.require_proof_of_delivery
                    ? "translate-x-5.5 ml-[22px]"
                    : "translate-x-0.5 ml-[2px]"
                }`}
              />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Max Delivery Radius (km)
            </label>
            <input
              type="number"
              value={settings.max_delivery_radius_km}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  max_delivery_radius_km: parseInt(e.target.value) || 0,
                }))
              }
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Default Estimated Time (minutes)
            </label>
            <input
              type="number"
              value={settings.default_estimated_time_minutes}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  default_estimated_time_minutes:
                    parseInt(e.target.value) || 0,
                }))
              }
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Financial Settings */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-5 border-b border-gray-200 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-violet-600" />
          <h2 className="font-semibold text-gray-900">Financial Settings</h2>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Platform Fee (%)
            </label>
            <input
              type="number"
              value={settings.default_platform_fee_percent}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  default_platform_fee_percent:
                    parseInt(e.target.value) || 0,
                }))
              }
              min={0}
              max={100}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Percentage of shipping fee kept as platform revenue. Driver
              receives the remainder.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Currency
            </label>
            <select
              value={settings.currency}
              onChange={(e) =>
                setSettings((s) => ({ ...s, currency: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm appearance-none bg-white focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
            >
              <option value="SLE">SLE (Sierra Leonean Leone)</option>
              <option value="USD">USD (US Dollar)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-5 border-b border-gray-200 flex items-center gap-2">
          <Bell className="h-5 w-5 text-violet-600" />
          <h2 className="font-semibold text-gray-900">Notifications</h2>
        </div>
        <div className="p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900 text-sm">
                Status Change Alerts
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                Get notified when a delivery status changes
              </div>
            </div>
            <button
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  notify_on_status_change: !s.notify_on_status_change,
                }))
              }
              className={`w-11 h-6 rounded-full transition-colors ${
                settings.notify_on_status_change
                  ? "bg-violet-600"
                  : "bg-gray-300"
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                  settings.notify_on_status_change
                    ? "translate-x-5.5 ml-[22px]"
                    : "translate-x-0.5 ml-[2px]"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900 text-sm">
                New Job Alerts for Drivers
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                Notify available drivers when a new job is created
              </div>
            </div>
            <button
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  notify_driver_on_new_job: !s.notify_driver_on_new_job,
                }))
              }
              className={`w-11 h-6 rounded-full transition-colors ${
                settings.notify_driver_on_new_job
                  ? "bg-violet-600"
                  : "bg-gray-300"
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                  settings.notify_driver_on_new_job
                    ? "translate-x-5.5 ml-[22px]"
                    : "translate-x-0.5 ml-[2px]"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-violet-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-violet-700 transition-colors disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Settings"}
        </button>
        {saved && (
          <span className="text-sm text-green-600 font-medium">
            Settings saved successfully!
          </span>
        )}
      </div>
    </div>
  );
}
