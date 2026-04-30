"use client";

import { useEffect, useState } from "react";
import {
  TrendingUp, Truck, DollarSign, Users, Clock, Star, AlertTriangle,
  CheckCircle, XCircle, RotateCcw, Package,
} from "lucide-react";

function getToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|; )peeap_shipping_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

interface Analytics {
  period: string;
  deliveries: { total: number; completed: number; cancelled: number; failed: number; returned: number; success_rate: number };
  revenue: { total: number; platform_fee: number; driver_payouts: number };
  drivers: { total: number; online: number };
  performance: { avg_delivery_minutes: number; avg_rating: number; total_ratings: number };
  disputes: { open: number };
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("week");

  useEffect(() => { loadAnalytics(); }, [period]);

  async function loadAnalytics() {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/analytics?period=${period}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error("Failed:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 bg-gray-200 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {["today", "week", "month", "all"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                period === p ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {p === "all" ? "All Time" : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Revenue */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon={DollarSign} iconBg="bg-green-100" iconColor="text-green-600" label="Total Revenue" value={`Le ${data.revenue.total.toLocaleString()}`} />
        <StatCard icon={DollarSign} iconBg="bg-violet-100" iconColor="text-violet-600" label="Platform Fee" value={`Le ${data.revenue.platform_fee.toLocaleString()}`} />
        <StatCard icon={DollarSign} iconBg="bg-blue-100" iconColor="text-blue-600" label="Driver Payouts" value={`Le ${data.revenue.driver_payouts.toLocaleString()}`} />
      </div>

      {/* Delivery stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={Package} iconBg="bg-gray-100" iconColor="text-gray-600" label="Total Deliveries" value={`${data.deliveries.total}`} />
        <StatCard icon={CheckCircle} iconBg="bg-green-100" iconColor="text-green-600" label="Completed" value={`${data.deliveries.completed}`} />
        <StatCard icon={XCircle} iconBg="bg-red-100" iconColor="text-red-600" label="Cancelled" value={`${data.deliveries.cancelled}`} />
        <StatCard icon={AlertTriangle} iconBg="bg-orange-100" iconColor="text-orange-600" label="Failed" value={`${data.deliveries.failed}`} />
        <StatCard icon={RotateCcw} iconBg="bg-amber-100" iconColor="text-amber-600" label="Returned" value={`${data.deliveries.returned}`} />
      </div>

      {/* Performance + Drivers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} iconBg="bg-emerald-100" iconColor="text-emerald-600" label="Success Rate" value={`${data.deliveries.success_rate}%`} />
        <StatCard icon={Clock} iconBg="bg-indigo-100" iconColor="text-indigo-600" label="Avg Delivery Time" value={data.performance.avg_delivery_minutes > 0 ? `${data.performance.avg_delivery_minutes} min` : "N/A"} />
        <StatCard icon={Star} iconBg="bg-yellow-100" iconColor="text-yellow-600" label="Avg Rating" value={data.performance.avg_rating > 0 ? `${data.performance.avg_rating}/5` : "N/A"} sub={`${data.performance.total_ratings} ratings`} />
        <StatCard icon={Users} iconBg="bg-blue-100" iconColor="text-blue-600" label="Drivers" value={`${data.drivers.online}/${data.drivers.total}`} sub="online / total" />
      </div>

      {/* Delivery Status Breakdown Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Delivery Breakdown</h3>
          <div className="space-y-3">
            {[
              { label: "Completed", value: data.deliveries.completed, color: "bg-emerald-500", total: data.deliveries.total },
              { label: "Cancelled", value: data.deliveries.cancelled, color: "bg-red-500", total: data.deliveries.total },
              { label: "Failed", value: data.deliveries.failed, color: "bg-orange-500", total: data.deliveries.total },
              { label: "Returned", value: data.deliveries.returned, color: "bg-amber-500", total: data.deliveries.total },
            ].map(({ label, value: v, color, total }) => (
              <div key={label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{label}</span>
                  <span className="font-medium">{v} ({total > 0 ? Math.round((v / total) * 100) : 0}%)</span>
                </div>
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${total > 0 ? (v / total) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Revenue Split</h3>
          <div className="flex items-center justify-center py-4">
            {/* Donut chart using SVG */}
            <svg width="160" height="160" viewBox="0 0 160 160">
              {(() => {
                const total = data.revenue.total || 1;
                const platform = data.revenue.platform_fee / total;
                const drivers = data.revenue.driver_payouts / total;
                const platformAngle = platform * 360;
                const driversAngle = drivers * 360;
                const toRad = (deg: number) => (deg - 90) * (Math.PI / 180);
                const arc = (start: number, end: number, r: number) => {
                  const s = toRad(start);
                  const e = toRad(end);
                  const large = end - start > 180 ? 1 : 0;
                  return `M ${80 + r * Math.cos(s)} ${80 + r * Math.sin(s)} A ${r} ${r} 0 ${large} 1 ${80 + r * Math.cos(e)} ${80 + r * Math.sin(e)}`;
                };
                return (
                  <>
                    <circle cx="80" cy="80" r="60" fill="none" stroke="#E5E7EB" strokeWidth="20" />
                    {platformAngle > 0 && <path d={arc(0, platformAngle, 60)} fill="none" stroke="#7C3AED" strokeWidth="20" strokeLinecap="round" />}
                    {driversAngle > 0 && <path d={arc(platformAngle, platformAngle + driversAngle, 60)} fill="none" stroke="#3B82F6" strokeWidth="20" strokeLinecap="round" />}
                    <text x="80" y="75" textAnchor="middle" className="text-lg font-bold" fill="#111827">Le {(data.revenue.total / 1000).toFixed(0)}k</text>
                    <text x="80" y="95" textAnchor="middle" className="text-xs" fill="#6B7280">Total Revenue</text>
                  </>
                );
              })()}
            </svg>
          </div>
          <div className="flex justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-violet-600" />
              <span className="text-gray-600">Platform: Le {data.revenue.platform_fee.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-gray-600">Drivers: Le {data.revenue.driver_payouts.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Disputes */}
      {data.disputes.open > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          <div>
            <span className="font-medium text-red-800">{data.disputes.open} open dispute{data.disputes.open > 1 ? "s" : ""}</span>
            <span className="text-sm text-red-600 ml-2">require attention</span>
          </div>
          <a href="/dashboard/disputes" className="ml-auto text-sm font-medium text-red-700 hover:text-red-800 underline">View</a>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, iconBg, iconColor, label, value, sub }: {
  icon: any; iconBg: string; iconColor: string; label: string; value: string; sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 ${iconBg} rounded-lg flex items-center justify-center`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}
