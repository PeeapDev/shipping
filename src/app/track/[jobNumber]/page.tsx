import {
  Truck,
  Package,
  MapPin,
  Clock,
  CheckCircle2,
  Circle,
  XCircle,
  User,
  Phone,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

interface TrackingUpdate {
  id: string;
  status: string;
  message: string | null;
  location_name: string | null;
  created_at: string;
}

interface TrackingData {
  delivery: {
    id: string;
    job_number: string;
    status: string;
    customer_name: string;
    pickup_city: string | null;
    delivery_city: string | null;
    delivery_address: string;
    package_size: string;
    package_description: string | null;
    estimated_delivery_time: string | null;
    actual_delivery_time: string | null;
    created_at: string;
    driver: {
      id: string;
      name: string;
      phone: string;
      vehicle_type: string;
      profile_picture: string | null;
    } | null;
  };
  tracking: TrackingUpdate[];
}

const statusConfig: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  pending: {
    label: "Order Placed",
    color: "text-yellow-600",
    bgColor: "bg-yellow-100",
  },
  assigned: {
    label: "Driver Assigned",
    color: "text-blue-600",
    bgColor: "bg-blue-100",
  },
  picked_up: {
    label: "Picked Up",
    color: "text-indigo-600",
    bgColor: "bg-indigo-100",
  },
  in_transit: {
    label: "In Transit",
    color: "text-purple-600",
    bgColor: "bg-purple-100",
  },
  delivered: {
    label: "Delivered",
    color: "text-green-600",
    bgColor: "bg-green-100",
  },
  completed: {
    label: "Completed",
    color: "text-emerald-600",
    bgColor: "bg-emerald-100",
  },
  cancelled: {
    label: "Cancelled",
    color: "text-red-600",
    bgColor: "bg-red-100",
  },
  failed: {
    label: "Failed",
    color: "text-red-600",
    bgColor: "bg-red-100",
  },
};

const statusOrder = [
  "pending",
  "assigned",
  "picked_up",
  "in_transit",
  "delivered",
  "completed",
];

async function fetchTracking(
  jobNumber: string
): Promise<TrackingData | null> {
  try {
    // Server component: fetch directly from Supabase instead of self-calling API
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobNumber);
    const column = isUUID ? "id" : "job_number";

    const { data: delivery, error } = await sb
      .from("delivery_jobs")
      .select("id, job_number, status, customer_name, pickup_city, delivery_city, delivery_address, package_size, package_description, estimated_delivery_time, actual_delivery_time, created_at, driver:drivers(id, name, phone, vehicle_type, profile_picture)")
      .eq(column, jobNumber)
      .single();

    if (error || !delivery) return null;

    const { data: updates } = await sb
      .from("tracking_updates")
      .select("*")
      .eq("job_id", delivery.id)
      .order("created_at", { ascending: true });

    return { delivery, tracking: updates || [] } as TrackingData;
  } catch {
    return null;
  }
}

export default async function TrackingPage({
  params,
}: {
  params: { jobNumber: string };
}) {
  const data = await fetchTracking(params.jobNumber);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link href="/" className="flex items-center gap-2">
              <Truck className="h-7 w-7 text-violet-600" />
              <span className="text-xl font-bold text-gray-900">
                Peeap Shipping
              </span>
            </Link>
            <Link
              href="/track"
              className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
            >
              <ArrowLeft className="h-4 w-4" />
              New Search
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {!data ? (
          /* Not found state */
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <XCircle className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Delivery Not Found
            </h2>
            <p className="text-gray-500 mb-6">
              We could not find a delivery with tracking number{" "}
              <span className="font-mono font-semibold">
                {params.jobNumber}
              </span>
              . Please check the number and try again.
            </p>
            <Link
              href="/track"
              className="inline-flex items-center bg-violet-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-violet-700 transition-colors"
            >
              Try Again
            </Link>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <Package className="h-4 w-4" />
                Tracking Number
              </div>
              <h1 className="text-2xl font-bold text-gray-900 font-mono">
                {data.delivery.job_number}
              </h1>
            </div>

            {/* Status Badge */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-500 mb-1">
                    Current Status
                  </div>
                  <span
                    className={`text-lg font-bold ${
                      statusConfig[data.delivery.status]?.color ||
                      "text-gray-900"
                    }`}
                  >
                    {statusConfig[data.delivery.status]?.label ||
                      data.delivery.status}
                  </span>
                </div>
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                    statusConfig[data.delivery.status]?.bgColor ||
                    "bg-gray-100"
                  }`}
                >
                  {data.delivery.status === "delivered" ||
                  data.delivery.status === "completed" ? (
                    <CheckCircle2
                      className={`h-7 w-7 ${
                        statusConfig[data.delivery.status]?.color
                      }`}
                    />
                  ) : data.delivery.status === "cancelled" ||
                    data.delivery.status === "failed" ? (
                    <XCircle
                      className={`h-7 w-7 ${
                        statusConfig[data.delivery.status]?.color
                      }`}
                    />
                  ) : (
                    <Truck
                      className={`h-7 w-7 ${
                        statusConfig[data.delivery.status]?.color
                      }`}
                    />
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {!["cancelled", "failed"].includes(data.delivery.status) && (
                <div className="mt-5">
                  <div className="flex gap-1">
                    {statusOrder.map((step, i) => {
                      const currentIdx = statusOrder.indexOf(
                        data.delivery.status
                      );
                      const isComplete = i <= currentIdx;
                      return (
                        <div
                          key={step}
                          className={`flex-1 h-2 rounded-full ${
                            isComplete ? "bg-violet-500" : "bg-gray-200"
                          }`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-gray-400">
                    <span>Ordered</span>
                    <span>Assigned</span>
                    <span>Picked Up</span>
                    <span>In Transit</span>
                    <span>Delivered</span>
                    <span>Done</span>
                  </div>
                </div>
              )}
            </div>

            {/* Delivery Details */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
              <h2 className="font-semibold text-gray-900 mb-4">
                Delivery Details
              </h2>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-gray-400">Pickup City</div>
                    <div className="text-sm text-gray-700">
                      {data.delivery.pickup_city || "N/A"}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-gray-400">
                      Delivery Address
                    </div>
                    <div className="text-sm text-gray-700">
                      {data.delivery.delivery_address}
                    </div>
                  </div>
                </div>
                {data.delivery.package_description && (
                  <div className="flex items-start gap-3">
                    <Package className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-gray-400">Package</div>
                      <div className="text-sm text-gray-700">
                        {data.delivery.package_description} (
                        {data.delivery.package_size})
                      </div>
                    </div>
                  </div>
                )}
                {data.delivery.estimated_delivery_time && (
                  <div className="flex items-start gap-3">
                    <Clock className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-gray-400">
                        Estimated Delivery
                      </div>
                      <div className="text-sm text-gray-700">
                        {new Date(
                          data.delivery.estimated_delivery_time
                        ).toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}
                {data.delivery.actual_delivery_time && (
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-gray-400">
                        Delivered At
                      </div>
                      <div className="text-sm text-gray-700">
                        {new Date(
                          data.delivery.actual_delivery_time
                        ).toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Driver Info */}
            {data.delivery.driver && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
                <h2 className="font-semibold text-gray-900 mb-4">
                  Your Driver
                </h2>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-violet-100 rounded-full flex items-center justify-center">
                    <User className="h-6 w-6 text-violet-600" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">
                      {data.delivery.driver.name}
                    </div>
                    <div className="text-sm text-gray-500 capitalize flex items-center gap-1">
                      <Truck className="h-3.5 w-3.5" />
                      {data.delivery.driver.vehicle_type}
                    </div>
                  </div>
                  <a
                    href={`tel:${data.delivery.driver.phone}`}
                    className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center hover:bg-green-200 transition-colors"
                  >
                    <Phone className="h-5 w-5 text-green-600" />
                  </a>
                </div>
              </div>
            )}

            {/* Map Placeholder */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
              <div className="p-5 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Live Map</h2>
              </div>
              <div className="h-48 bg-gray-100 flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <MapPin className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Map integration coming soon</p>
                </div>
              </div>
            </div>

            {/* Tracking Timeline */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4">
                Tracking Timeline
              </h2>
              {data.tracking.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No tracking updates yet.
                </p>
              ) : (
                <div className="space-y-0">
                  {[...data.tracking].reverse().map((update, i) => {
                    const isFirst = i === 0;
                    const isLast = i === data.tracking.length - 1;
                    return (
                      <div key={update.id} className="flex gap-3">
                        {/* Timeline line + dot */}
                        <div className="flex flex-col items-center">
                          <div
                            className={`w-3 h-3 rounded-full flex-shrink-0 mt-1.5 ${
                              isFirst
                                ? "bg-violet-500"
                                : "bg-gray-300"
                            }`}
                          />
                          {!isLast && (
                            <div className="w-0.5 flex-1 bg-gray-200 my-1" />
                          )}
                        </div>
                        {/* Content */}
                        <div className="pb-6">
                          <div
                            className={`text-sm font-medium ${
                              isFirst ? "text-gray-900" : "text-gray-600"
                            }`}
                          >
                            {statusConfig[update.status]?.label ||
                              update.status.replace(/_/g, " ")}
                          </div>
                          {update.message && (
                            <div className="text-sm text-gray-500 mt-0.5">
                              {update.message}
                            </div>
                          )}
                          {update.location_name && (
                            <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {update.location_name}
                            </div>
                          )}
                          <div className="text-xs text-gray-400 mt-1">
                            {new Date(update.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
