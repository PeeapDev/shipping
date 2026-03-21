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
      // Placeholder — in production, call API
      const allJobs: DeliveryJob[] = [
        makeJob("1", "SHP-20260321-A1B2", "City Electronics", "Ibrahim Kamara", "in_transit", 15, "small", -45),
        makeJob("2", "SHP-20260321-C3D4", "Fresh Mart", "Aminata Sesay", "pending", 20, "medium", -30),
        makeJob("3", "SHP-20260321-E5F6", "City Electronics", "Mohamed Bangura", "completed", 10, "small", -120),
        makeJob("4", "SHP-20260320-G7H8", "TechHub SL", "Fatmata Koroma", "delivered", 25, "large", -240),
        makeJob("5", "SHP-20260320-I9J0", "Fashion House", "Abu Kamara", "cancelled", 18, "medium", -360),
        makeJob("6", "SHP-20260319-K1L2", "Pharmacy Plus", "Isatu Bah", "completed", 12, "small", -1440),
      ];

      const filtered =
        statusFilter === "all"
          ? allJobs
          : allJobs.filter((j) => j.status === statusFilter);

      setJobs(filtered);
    } finally {
      setLoading(false);
    }
  }

  function makeJob(
    id: string,
    jobNumber: string,
    merchant: string,
    customer: string,
    status: string,
    fee: number,
    size: string,
    minutesAgo: number
  ): DeliveryJob {
    return {
      id,
      job_number: jobNumber,
      store_order_id: null,
      transaction_id: null,
      merchant_id: "m1",
      merchant_name: merchant,
      customer_id: "c1",
      customer_name: customer,
      customer_phone: "+23276000000",
      driver_id: status !== "pending" ? "d1" : null,
      pickup_address: "Freetown Central",
      pickup_city: "Freetown",
      pickup_lat: null,
      pickup_lng: null,
      pickup_instructions: null,
      delivery_address: "Customer Address, Freetown",
      delivery_city: "Freetown",
      delivery_lat: null,
      delivery_lng: null,
      delivery_instructions: null,
      preferred_date: null,
      preferred_time_slot: null,
      estimated_pickup_time: null,
      estimated_delivery_time: null,
      actual_pickup_time: null,
      actual_delivery_time: null,
      shipping_fee: fee,
      driver_payout: fee * 0.8,
      platform_fee: fee * 0.2,
      status: status as any,
      cancel_reason: status === "cancelled" ? "Customer request" : null,
      failure_reason: null,
      package_description: "Package",
      package_weight_kg: 1,
      package_size: size as any,
      requires_signature: false,
      proof_of_delivery_url: null,
      items: [],
      metadata: {},
      created_at: new Date(Date.now() + minutesAgo * 60000).toISOString(),
      updated_at: new Date(Date.now() + minutesAgo * 60000).toISOString(),
    };
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
