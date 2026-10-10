"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Package, MapPin, ArrowRight, Clock, Search, X, Truck, Phone, User,
  ChevronRight, Copy, CheckCircle, AlertTriangle,
} from "lucide-react";
import type { DeliveryJob } from "@/types/shipping";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  assigned: "bg-blue-100 text-blue-700",
  picked_up: "bg-indigo-100 text-indigo-700",
  in_transit: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
  failed: "bg-red-100 text-red-700",
  returning: "bg-amber-100 text-amber-700",
  returned: "bg-orange-100 text-orange-700",
};

const allStatuses = [
  "all", "pending", "assigned", "picked_up", "in_transit",
  "delivered", "completed", "cancelled", "failed", "returning", "returned",
];

const validTransitions: Record<string, string[]> = {
  pending: ["assigned", "cancelled"],
  assigned: ["picked_up", "cancelled"],
  picked_up: ["in_transit", "cancelled", "failed"],
  in_transit: ["delivered", "failed", "returning"],
  delivered: ["completed"],
  failed: ["returning"],
  returning: ["returned"],
};

function getToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|; )peeap_shipping_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export default function AllJobsPage() {
  const [jobs, setJobs] = useState<DeliveryJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJob, setSelectedJob] = useState<DeliveryJob | null>(null);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [availableDrivers, setAvailableDrivers] = useState<any[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selectedIds.size === filteredJobs.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredJobs.map(j => j.id)));
  }

  async function bulkUpdateStatus(newStatus: string) {
    if (selectedIds.size === 0) return;
    const reason = newStatus === "cancelled" ? prompt("Cancel reason:") : undefined;
    if (newStatus === "cancelled" && !reason) return;
    setUpdating(true);
    const token = getToken();
    let success = 0;
    for (const id of selectedIds) {
      try {
        const res = await fetch(`/api/deliveries/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ status: newStatus, cancel_reason: reason }),
        });
        if (res.ok) success++;
      } catch {}
    }
    setMessage({ type: "success", text: `${success}/${selectedIds.size} jobs updated to ${newStatus}` });
    setSelectedIds(new Set());
    loadJobs();
    setUpdating(false);
  }

  useEffect(() => {
    loadJobs();
    const interval = setInterval(() => loadJobs(), 30_000);
    return () => clearInterval(interval);
  }, [statusFilter]);
  useEffect(() => { if (message) { const t = setTimeout(() => setMessage(null), 3000); return () => clearTimeout(t); } }, [message]);

  async function loadJobs() {
    setLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams({ limit: "100" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/deliveries?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setJobs(data.deliveries || []);
      }
    } catch (err) {
      console.error("Failed to load jobs:", err);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(jobId: string, newStatus: string, extra?: Record<string, string>) {
    setUpdating(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/deliveries/${jobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ status: newStatus, ...extra }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: `Status updated to ${newStatus.replace(/_/g, " ")}` });
        loadJobs();
        // Refresh selected job
        if (selectedJob?.id === jobId) {
          const detail = await res.json();
          setSelectedJob(detail.delivery || null);
        }
      } else {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        setMessage({ type: "error", text: err.error || "Failed to update" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setUpdating(false);
    }
  }

  async function loadAvailableDrivers() {
    setLoadingDrivers(true);
    try {
      const token = getToken();
      const res = await fetch("/api/drivers?available=true", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableDrivers(data.drivers || []);
      }
    } catch {} finally { setLoadingDrivers(false); }
  }

  async function assignDriver(jobId: string, driverId: string) {
    setUpdating(true);
    try {
      const token = getToken();
      // First assign driver_id, then update status to assigned
      const res = await fetch(`/api/deliveries/${jobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ status: "assigned", driver_id: driverId }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: "Driver assigned!" });
        loadJobs();
        loadJobDetail(jobId);
      } else {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        setMessage({ type: "error", text: err.error || "Failed to assign" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally { setUpdating(false); }
  }

  async function loadJobDetail(jobId: string) {
    try {
      const token = getToken();
      const res = await fetch(`/api/deliveries/${jobId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedJob(data.delivery);
      }
    } catch {
      console.error("Failed to load job detail");
    }
  }

  const filteredJobs = jobs.filter((j) =>
    !searchQuery ||
    j.job_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    j.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    j.merchant_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        <div className="h-12 bg-gray-200 rounded-lg" />
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-gray-200 rounded" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold text-gray-900">All Jobs</h1><Link href="/dashboard/zones" className="rounded-lg border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">Pricing &amp; zones →</Link></div>

      {message && (
        <div className={`p-3 rounded-lg text-sm font-medium ${message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by job #, customer, merchant..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
          {allStatuses.map((s) => <option key={s} value={s}>{s === "all" ? "All Statuses" : s.replace(/_/g, " ")}</option>)}
        </select>
        <button onClick={selectAll} className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          {selectedIds.size === filteredJobs.length && filteredJobs.length > 0 ? "Deselect All" : "Select All"}
        </button>
      </div>

      {/* Batch action bar */}
      {selectedIds.size > 0 && (
        <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm font-medium text-violet-700">{selectedIds.size} job{selectedIds.size > 1 ? "s" : ""} selected</span>
          <div className="flex gap-2">
            <button onClick={() => bulkUpdateStatus("cancelled")} disabled={updating} className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 disabled:opacity-50">Cancel Selected</button>
            <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200">Clear Selection</button>
          </div>
        </div>
      )}

      <div className="flex gap-4">
        {/* Job list */}
        <div className={`${selectedJob ? "w-1/2" : "w-full"} space-y-2 transition-all`}>
          {filteredJobs.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No jobs found</p>
            </div>
          ) : (
            filteredJobs.map((job) => (
              <div
                key={job.id}
                onClick={() => loadJobDetail(job.id)}
                className={`bg-white rounded-lg border p-4 cursor-pointer hover:border-violet-300 transition-colors ${selectedJob?.id === job.id ? "border-violet-500 ring-1 ring-violet-500" : "border-gray-200"}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(job.id)}
                      onChange={(e) => { e.stopPropagation(); toggleSelect(job.id); }}
                      className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 shrink-0"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 text-sm">{job.job_number}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[job.status] || "bg-gray-100 text-gray-600"}`}>
                          {job.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {job.customer_name} — {job.pickup_city || "?"} → {job.delivery_city || "?"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-medium text-gray-900">Le {(job.shipping_fee || 0).toFixed(0)}</span>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Detail panel */}
        {selectedJob && (
          <div className="w-1/2 bg-white rounded-xl border border-gray-200 p-5 sticky top-4 max-h-[calc(100vh-120px)] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg text-gray-900">{selectedJob.job_number}</h2>
              <button onClick={() => setSelectedJob(null)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2 mb-4">
              <span className={`text-sm px-3 py-1 rounded-full font-medium ${statusColors[selectedJob.status] || "bg-gray-100"}`}>
                {selectedJob.status.replace(/_/g, " ")}
              </span>
              {selectedJob.is_cod && <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full font-medium">COD</span>}
            </div>

            {/* Verification Status (codes hidden — managed by marketplace) */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 font-medium">Pickup Verification</span>
                <span className={`text-sm font-medium ${selectedJob.pickup_verified_at ? "text-green-600" : "text-yellow-600"}`}>
                  {selectedJob.pickup_verified_at ? "Verified" : "Pending"}
                  {selectedJob.pickup_verified_at && <CheckCircle className="inline h-3.5 w-3.5 ml-1" />}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 font-medium">Delivery Verification</span>
                <span className={`text-sm font-medium ${selectedJob.delivery_verified_at ? "text-green-600" : "text-yellow-600"}`}>
                  {selectedJob.delivery_verified_at ? "Verified" : "Pending"}
                  {selectedJob.delivery_verified_at && <CheckCircle className="inline h-3.5 w-3.5 ml-1" />}
                </span>
              </div>
            </div>

            {/* Addresses */}
            <div className="space-y-3 mb-4">
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs text-gray-400">Pickup</div>
                  <div className="text-sm text-gray-700">{selectedJob.pickup_address} ({selectedJob.pickup_city})</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs text-gray-400">Delivery</div>
                  <div className="text-sm text-gray-700">{selectedJob.delivery_address} ({selectedJob.delivery_city})</div>
                </div>
              </div>
            </div>

            {/* Customer & Driver */}
            <div className="space-y-2 mb-4 text-sm">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600">Customer:</span>
                <span className="font-medium">{selectedJob.customer_name}</span>
                {selectedJob.customer_phone && (
                  <a href={`tel:${selectedJob.customer_phone}`} className="text-violet-600 hover:underline text-xs">{selectedJob.customer_phone}</a>
                )}
              </div>
              {selectedJob.driver && (
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600">Driver:</span>
                  <span className="font-medium">{(selectedJob.driver as any)?.name || "Assigned"}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600">Package:</span>
                <span>{selectedJob.package_description || selectedJob.package_size}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600">Created:</span>
                <span>{new Date(selectedJob.created_at).toLocaleString()}</span>
              </div>
              {selectedJob.estimated_delivery_date && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600">Est. Delivery:</span>
                  <span>{new Date(selectedJob.estimated_delivery_date).toLocaleDateString()}</span>
                </div>
              )}
            </div>

            {/* Fee breakdown */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Shipping Fee</span><span className="font-medium">Le {(selectedJob.shipping_fee || 0).toFixed(0)}</span></div>
              {selectedJob.driver_payout > 0 && <div className="flex justify-between"><span className="text-gray-500">Driver Payout</span><span>Le {selectedJob.driver_payout.toFixed(0)}</span></div>}
              {selectedJob.platform_fee > 0 && <div className="flex justify-between"><span className="text-gray-500">Platform Fee</span><span>Le {selectedJob.platform_fee.toFixed(0)}</span></div>}
            </div>

            {/* Tracking timeline */}
            {selectedJob.tracking_updates && selectedJob.tracking_updates.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Timeline</h3>
                <div className="space-y-0">
                  {[...selectedJob.tracking_updates].reverse().map((u: any, i: number) => (
                    <div key={u.id} className="flex gap-2 pb-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-2.5 h-2.5 rounded-full mt-1 ${i === 0 ? "bg-violet-500" : "bg-gray-300"}`} />
                        {i < (selectedJob.tracking_updates?.length || 0) - 1 && <div className="w-0.5 flex-1 bg-gray-200 my-1" />}
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-700">{u.message || u.status}</div>
                        <div className="text-xs text-gray-400">{new Date(u.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Status update buttons */}
            {validTransitions[selectedJob.status]?.length > 0 && (
              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Update Status</h3>
                <div className="flex flex-wrap gap-2">
                  {validTransitions[selectedJob.status].map((nextStatus) => (
                    <button
                      key={nextStatus}
                      onClick={() => {
                        if (nextStatus === "cancelled") {
                          const reason = prompt("Cancel reason:");
                          if (reason) updateStatus(selectedJob.id, nextStatus, { cancel_reason: reason });
                        } else if (nextStatus === "failed") {
                          const reason = prompt("Failure reason:");
                          if (reason) updateStatus(selectedJob.id, nextStatus, { failure_reason: reason });
                        } else {
                          updateStatus(selectedJob.id, nextStatus);
                        }
                      }}
                      disabled={updating}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                        nextStatus === "cancelled" || nextStatus === "failed"
                          ? "bg-red-100 text-red-700 hover:bg-red-200"
                          : nextStatus === "returning"
                          ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                          : "bg-violet-100 text-violet-700 hover:bg-violet-200"
                      }`}
                    >
                      {nextStatus.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Assign Driver (for pending jobs) */}
            {selectedJob.status === "pending" && (
              <div className="border-t border-gray-100 pt-4 mt-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Assign Driver</h3>
                {availableDrivers.length === 0 && !loadingDrivers && (
                  <button onClick={loadAvailableDrivers} className="text-sm text-violet-600 hover:underline">Load available drivers</button>
                )}
                {loadingDrivers && <p className="text-sm text-gray-400">Loading drivers...</p>}
                {availableDrivers.length > 0 && (
                  <div className="space-y-2">
                    {availableDrivers.map((d: any) => (
                      <div key={d.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                        <div>
                          <span className="text-sm font-medium">{d.name}</span>
                          <span className="text-xs text-gray-500 ml-2">{d.vehicle_type} — {d.city || 'N/A'}</span>
                          {d.average_rating > 0 && <span className="text-xs text-yellow-600 ml-2">★ {d.average_rating.toFixed(1)}</span>}
                        </div>
                        <button
                          onClick={() => assignDriver(selectedJob.id, d.id)}
                          disabled={updating}
                          className="px-3 py-1 bg-violet-600 text-white text-xs rounded-lg hover:bg-violet-700 disabled:opacity-50"
                        >
                          Assign
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Track link */}
            <div className="mt-4 pt-3 border-t border-gray-100">
              <a
                href={`/track/${selectedJob.job_number}`}
                target="_blank"
                className="text-sm text-violet-600 hover:underline font-medium"
              >
                Open public tracking page →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
