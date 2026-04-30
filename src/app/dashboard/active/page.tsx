"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Package,
  MapPin,
  ArrowRight,
  Clock,
  Phone,
  User,
  Truck,
  RefreshCw,
  ScanLine,
} from "lucide-react";
import type { DeliveryJob } from "@/types/shipping";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  assigned: "bg-blue-100 text-blue-700",
  picked_up: "bg-indigo-100 text-indigo-700",
  in_transit: "bg-purple-100 text-purple-700",
  returning: "bg-amber-100 text-amber-700",
  returned: "bg-orange-100 text-orange-700",
};

const statusSteps = ["pending", "assigned", "picked_up", "in_transit", "returning"];

export default function ActiveDeliveriesPage() {
  const [deliveries, setDeliveries] = useState<DeliveryJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActiveDeliveries();
    const interval = setInterval(() => loadActiveDeliveries(), 15_000);
    return () => clearInterval(interval);
  }, []);

  async function loadActiveDeliveries() {
    setLoading(true);
    try {
      const res = await fetch("/api/deliveries?limit=50");
      if (res.ok) {
        const data = await res.json();
        const active = (data.deliveries || []).filter((j: DeliveryJob) =>
          ["pending", "assigned", "picked_up", "in_transit", "returning"].includes(j.status)
        );
        setDeliveries(active);
      }
    } catch (err) {
      console.error("Failed to load active deliveries:", err);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(jobId: string, newStatus: string, driverId?: string) {
    try {
      const body: any = { status: newStatus };
      if (driverId) body.driver_id = driverId;
      const res = await fetch(`/api/deliveries/${jobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        loadActiveDeliveries();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to update status");
      }
    } catch {
      alert("Failed to update status");
    }
  }

  function getStepIndex(status: string) {
    return statusSteps.indexOf(status);
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-64 bg-gray-200 rounded" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-48 bg-gray-200 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Active Deliveries</h1>
        <button
          onClick={loadActiveDeliveries}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 bg-white border border-gray-200 px-3 py-2 rounded-lg"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {deliveries.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No active deliveries right now.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {deliveries.map((job) => {
            const stepIndex = getStepIndex(job.status);
            return (
              <div
                key={job.id}
                className="bg-white rounded-xl border border-gray-200 p-5"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">
                        {job.job_number}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          statusColors[job.status] ||
                          "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {job.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {job.merchant_name} &rarr; {job.customer_name}
                    </p>
                  </div>
                  <div className="text-right">
                    {/* SLA Warning */}
                    {(() => {
                      const elapsed = Math.round((Date.now() - new Date(job.created_at).getTime()) / 60000);
                      const isOverdue = elapsed > 90; // Over 90 minutes
                      const isWarning = elapsed > 60; // Over 60 minutes
                      return (
                        <div className={`text-xs font-medium mb-1 ${isOverdue ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-gray-400'}`}>
                          {isOverdue ? '⚠ OVERDUE' : ''} {elapsed < 60 ? `${elapsed}m` : `${Math.floor(elapsed/60)}h ${elapsed%60}m`} elapsed
                        </div>
                      );
                    })()}
                    <div className="font-semibold text-gray-900">
                      Le {job.shipping_fee.toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-400">
                      {job.package_size} package
                    </div>
                  </div>
                </div>

                {/* Progress steps */}
                <div className="flex items-center gap-1 mb-4">
                  {statusSteps.map((step, i) => (
                    <div key={step} className="flex-1 flex items-center">
                      <div
                        className={`h-2 flex-1 rounded-full ${
                          i <= stepIndex ? "bg-violet-500" : "bg-gray-200"
                        }`}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-gray-400 mb-4">
                  <span>Pending</span>
                  <span>Assigned</span>
                  <span>Picked Up</span>
                  <span>In Transit</span>
                </div>

                {/* Route */}
                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-gray-400">Pickup</div>
                      <div className="text-gray-700">{job.pickup_address}</div>
                      {job.pickup_instructions && (
                        <div className="text-xs text-gray-400 mt-1">
                          {job.pickup_instructions}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-gray-400">Delivery</div>
                      <div className="text-gray-700">
                        {job.delivery_address}
                      </div>
                      {job.delivery_instructions && (
                        <div className="text-xs text-gray-400 mt-1">
                          {job.delivery_instructions}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Driver info */}
                {job.driver ? (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 bg-violet-100 rounded-full flex items-center justify-center">
                      <User className="h-4 w-4 text-violet-600" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {job.driver.name}
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                        <Truck className="h-3 w-3" />
                        {job.driver.vehicle_type}
                        {job.driver.vehicle_plate &&
                          ` (${job.driver.vehicle_plate})`}
                      </div>
                    </div>
                    <a
                      href={`tel:${job.driver.phone}`}
                      className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center hover:bg-green-200 transition-colors"
                    >
                      <Phone className="h-4 w-4 text-green-600" />
                    </a>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg text-sm text-yellow-700">
                    <Clock className="h-4 w-4" />
                    Awaiting driver assignment
                  </div>
                )}

                {/* Customer */}
                <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
                  <Phone className="h-3.5 w-3.5" />
                  {job.customer_name} &mdash; {job.customer_phone}
                </div>

                {/* Status Actions */}
                <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
                  {job.status === "pending" && (
                    <button
                      onClick={() => updateStatus(job.id, "assigned")}
                      className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
                    >
                      Assign Driver
                    </button>
                  )}
                  {(job.status === "assigned" || job.status === "in_transit") && (
                    <Link
                      href="/dashboard/dispatch"
                      className="text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 inline-flex items-center gap-1"
                    >
                      <ScanLine className="h-3.5 w-3.5" />
                      {job.status === "assigned" ? "Verify & Collect" : "Verify & Deliver"}
                    </Link>
                  )}
                  {!["delivered", "completed", "cancelled", "failed"].includes(job.status) && (
                    <button
                      onClick={() => {
                        const reason = prompt("Cancel reason:");
                        if (reason) updateStatus(job.id, "cancelled");
                      }}
                      className="text-xs bg-white text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
