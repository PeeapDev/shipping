"use client";

import { useEffect, useState } from "react";
import {
  Package,
  MapPin,
  ArrowRight,
  Clock,
  Phone,
  User,
  Truck,
  RefreshCw,
} from "lucide-react";
import type { DeliveryJob } from "@/types/shipping";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  assigned: "bg-blue-100 text-blue-700",
  picked_up: "bg-indigo-100 text-indigo-700",
  in_transit: "bg-purple-100 text-purple-700",
};

const statusSteps = ["pending", "assigned", "picked_up", "in_transit"];

export default function ActiveDeliveriesPage() {
  const [deliveries, setDeliveries] = useState<DeliveryJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActiveDeliveries();
  }, []);

  async function loadActiveDeliveries() {
    setLoading(true);
    try {
      // Placeholder data — in production, fetch from API with auth
      setDeliveries([
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
          pickup_instructions: "Ask for Mohamed at the counter",
          delivery_address: "42 Wilkinson Rd, Freetown",
          delivery_city: "Freetown",
          delivery_lat: null,
          delivery_lng: null,
          delivery_instructions: "Call on arrival",
          preferred_date: null,
          preferred_time_slot: null,
          estimated_pickup_time: null,
          estimated_delivery_time: null,
          actual_pickup_time: new Date(Date.now() - 20 * 60000).toISOString(),
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
          created_at: new Date(Date.now() - 45 * 60000).toISOString(),
          updated_at: new Date(Date.now() - 5 * 60000).toISOString(),
          driver: {
            id: "d1",
            user_id: "u1",
            name: "Alhaji Driver",
            phone: "+23276999888",
            email: null,
            vehicle_type: "motorcycle",
            vehicle_plate: "AGA-1234",
            profile_picture: null,
            city: "Freetown",
            is_active: true,
            is_available: false,
            current_lat: null,
            current_lng: null,
            total_deliveries: 234,
            total_earnings: 5400,
            average_rating: 4.7,
            total_ratings: 180,
            created_at: "",
            updated_at: "",
          },
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
      ]);
    } finally {
      setLoading(false);
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
