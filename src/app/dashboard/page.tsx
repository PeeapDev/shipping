"use client";

import { useEffect, useState } from "react";
import {
  Truck,
  PackageCheck,
  DollarSign,
  Users,
  Clock,
  MapPin,
  ArrowRight,
  Package,
  ChevronRight,
} from "lucide-react";
import type { DeliveryJob, DashboardStats } from "@/types/shipping";

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

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    active_deliveries: 0,
    completed_today: 0,
    revenue_today: 0,
    total_drivers: 0,
    available_drivers: 0,
  });
  const [recentJobs, setRecentJobs] = useState<DeliveryJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      // In production, these would be real API calls with auth tokens
      // For now, show placeholder data
      setStats({
        active_deliveries: 12,
        completed_today: 45,
        revenue_today: 1250.0,
        total_drivers: 28,
        available_drivers: 15,
      });

      setRecentJobs([
        {
          id: "1",
          job_number: "SHP-20260321-A1B2",
          store_order_id: null,
          transaction_id: null,
          merchant_id: "m1",
          merchant_name: "City Electronics",
          customer_id: "c1",
          customer_name: "Ibrahim Kamara",
          customer_phone: "+23276123456",
          driver_id: "d1",
          pickup_address: "15 Siaka Stevens St, Freetown",
          pickup_city: "Freetown",
          pickup_lat: null,
          pickup_lng: null,
          pickup_instructions: null,
          delivery_address: "42 Wilkinson Rd, Freetown",
          delivery_city: "Freetown",
          delivery_lat: null,
          delivery_lng: null,
          delivery_instructions: "Call on arrival",
          preferred_date: null,
          preferred_time_slot: null,
          estimated_pickup_time: null,
          estimated_delivery_time: null,
          actual_pickup_time: null,
          actual_delivery_time: null,
          shipping_fee: 15.0,
          driver_payout: 12.0,
          platform_fee: 3.0,
          status: "in_transit",
          cancel_reason: null,
          failure_reason: null,
          package_description: "Samsung Galaxy A15",
          package_weight_kg: 0.5,
          package_size: "small",
          requires_signature: false,
          proof_of_delivery_url: null,
          items: [],
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "2",
          job_number: "SHP-20260321-C3D4",
          store_order_id: null,
          transaction_id: null,
          merchant_id: "m2",
          merchant_name: "Fresh Mart",
          customer_id: "c2",
          customer_name: "Aminata Sesay",
          customer_phone: "+23278987654",
          driver_id: null,
          pickup_address: "8 Lumley Beach Rd, Freetown",
          pickup_city: "Freetown",
          pickup_lat: null,
          pickup_lng: null,
          pickup_instructions: null,
          delivery_address: "22 Hill Station, Freetown",
          delivery_city: "Freetown",
          delivery_lat: null,
          delivery_lng: null,
          delivery_instructions: null,
          preferred_date: null,
          preferred_time_slot: "afternoon",
          estimated_pickup_time: null,
          estimated_delivery_time: null,
          actual_pickup_time: null,
          actual_delivery_time: null,
          shipping_fee: 20.0,
          driver_payout: 16.0,
          platform_fee: 4.0,
          status: "pending",
          cancel_reason: null,
          failure_reason: null,
          package_description: "Grocery box",
          package_weight_kg: 3.0,
          package_size: "medium",
          requires_signature: false,
          proof_of_delivery_url: null,
          items: [],
          metadata: {},
          created_at: new Date(Date.now() - 30 * 60000).toISOString(),
          updated_at: new Date(Date.now() - 30 * 60000).toISOString(),
        },
        {
          id: "3",
          job_number: "SHP-20260321-E5F6",
          store_order_id: null,
          transaction_id: null,
          merchant_id: "m1",
          merchant_name: "City Electronics",
          customer_id: "c3",
          customer_name: "Mohamed Bangura",
          customer_phone: "+23277555888",
          driver_id: "d2",
          pickup_address: "15 Siaka Stevens St, Freetown",
          pickup_city: "Freetown",
          pickup_lat: null,
          pickup_lng: null,
          pickup_instructions: null,
          delivery_address: "3 Pademba Rd, Freetown",
          delivery_city: "Freetown",
          delivery_lat: null,
          delivery_lng: null,
          delivery_instructions: null,
          preferred_date: null,
          preferred_time_slot: null,
          estimated_pickup_time: null,
          estimated_delivery_time: null,
          actual_pickup_time: new Date(Date.now() - 60 * 60000).toISOString(),
          actual_delivery_time: new Date(Date.now() - 15 * 60000).toISOString(),
          shipping_fee: 10.0,
          driver_payout: 8.0,
          platform_fee: 2.0,
          status: "completed",
          cancel_reason: null,
          failure_reason: null,
          package_description: "Phone case + charger",
          package_weight_kg: 0.3,
          package_size: "small",
          requires_signature: false,
          proof_of_delivery_url: null,
          items: [],
          metadata: {},
          created_at: new Date(Date.now() - 120 * 60000).toISOString(),
          updated_at: new Date(Date.now() - 15 * 60000).toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-gray-200 rounded-xl" />
          ))}
        </div>
        <div className="h-64 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="text-sm text-gray-500">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
              <Truck className="h-5 w-5 text-violet-600" />
            </div>
            <span className="text-sm text-gray-500">Active</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {stats.active_deliveries}
          </div>
          <div className="text-xs text-gray-400 mt-1">deliveries in progress</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <PackageCheck className="h-5 w-5 text-green-600" />
            </div>
            <span className="text-sm text-gray-500">Completed</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {stats.completed_today}
          </div>
          <div className="text-xs text-gray-400 mt-1">today</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-amber-600" />
            </div>
            <span className="text-sm text-gray-500">Revenue</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            Le {stats.revenue_today.toLocaleString()}
          </div>
          <div className="text-xs text-gray-400 mt-1">today</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <span className="text-sm text-gray-500">Drivers</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {stats.available_drivers}
            <span className="text-sm font-normal text-gray-400">
              /{stats.total_drivers}
            </span>
          </div>
          <div className="text-xs text-gray-400 mt-1">available now</div>
        </div>
      </div>

      {/* Active Deliveries Map Placeholder */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Active Deliveries Map</h2>
          <span className="text-xs bg-violet-100 text-violet-700 px-2 py-1 rounded-full font-medium">
            {stats.active_deliveries} active
          </span>
        </div>
        <div className="h-64 bg-gray-100 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Map integration coming soon</p>
            <p className="text-xs mt-1">
              Live driver locations will appear here
            </p>
          </div>
        </div>
      </div>

      {/* Recent Deliveries */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Recent Deliveries</h2>
          <a
            href="/dashboard/jobs"
            className="text-sm text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1"
          >
            View all
            <ChevronRight className="h-4 w-4" />
          </a>
        </div>
        <div className="divide-y divide-gray-100">
          {recentJobs.map((job) => (
            <div
              key={job.id}
              className="p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Package className="h-5 w-5 text-gray-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 text-sm">
                        {job.job_number}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          statusColors[job.status] || "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {job.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {job.customer_name} &mdash;{" "}
                      {job.package_description || "Package"}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {job.pickup_city || "N/A"}
                        <ArrowRight className="h-3 w-3" />
                        {job.delivery_city || "N/A"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(job.created_at).toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-gray-900 text-sm">
                    Le {job.shipping_fee.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {job.package_size}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
