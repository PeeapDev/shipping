"use client";

import { useEffect, useState } from "react";
import {
  Package,
  MapPin,
  ArrowRight,
  Clock,
  Search,
  Filter,
  ChevronDown,
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
};

const allStatuses = [
  "all",
  "pending",
  "assigned",
  "picked_up",
  "in_transit",
  "delivered",
  "completed",
  "cancelled",
  "failed",
];

export default function AllJobsPage() {
  const [jobs, setJobs] = useState<DeliveryJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadJobs();
  }, [statusFilter]);

  async function loadJobs() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/deliveries?${params}`);
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

  const filteredJobs = searchQuery
    ? jobs.filter(
        (j) =>
          j.job_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
          j.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (j.merchant_name || "")
            .toLowerCase()
            .includes(searchQuery.toLowerCase())
      )
    : jobs;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">All Jobs</h1>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by job number, customer, or merchant..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="pl-10 pr-8 py-2.5 border border-gray-200 rounded-lg text-sm appearance-none bg-white focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
          >
            {allStatuses.map((s) => (
              <option key={s} value={s}>
                {s === "all"
                  ? "All Statuses"
                  : s.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Jobs table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="animate-pulse p-6 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded" />
            ))}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No delivery jobs found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-500 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3">Job #</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Merchant</th>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3">Fee</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredJobs.map((job) => (
                  <tr
                    key={job.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {job.job_number}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {job.customer_name}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {job.merchant_name}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-gray-500">
                        <MapPin className="h-3 w-3 text-green-500" />
                        <span>{job.pickup_city}</span>
                        <ArrowRight className="h-3 w-3" />
                        <MapPin className="h-3 w-3 text-red-500" />
                        <span>{job.delivery_city}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      Le {job.shipping_fee.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          statusColors[job.status] ||
                          "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {job.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(job.created_at).toLocaleDateString()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
