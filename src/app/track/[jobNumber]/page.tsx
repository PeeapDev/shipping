"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Truck,
  Package,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  User,
  Phone,
  ArrowLeft,
  RefreshCw,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

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
    estimated_delivery_date: string | null;
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

const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  pending: { label: "Order Placed", color: "text-yellow-600", bgColor: "bg-yellow-100" },
  assigned: { label: "Driver Assigned", color: "text-blue-600", bgColor: "bg-blue-100" },
  picked_up: { label: "Picked Up", color: "text-indigo-600", bgColor: "bg-indigo-100" },
  in_transit: { label: "In Transit", color: "text-purple-600", bgColor: "bg-purple-100" },
  delivered: { label: "Delivered", color: "text-green-600", bgColor: "bg-green-100" },
  completed: { label: "Completed", color: "text-emerald-600", bgColor: "bg-emerald-100" },
  cancelled: { label: "Cancelled", color: "text-red-600", bgColor: "bg-red-100" },
  failed: { label: "Failed", color: "text-red-600", bgColor: "bg-red-100" },
  returning: { label: "Returning to Vendor", color: "text-amber-600", bgColor: "bg-amber-100" },
  returned: { label: "Returned", color: "text-orange-600", bgColor: "bg-orange-100" },
};

const statusOrder = ["pending", "assigned", "picked_up", "in_transit", "delivered", "completed"];

const ACTIVE_STATUSES = ["pending", "assigned", "picked_up", "in_transit", "returning"];

export default function TrackingPage() {
  const params = useParams();
  const jobNumber = params.jobNumber as string;

  const [data, setData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchTracking = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetch(`/api/deliveries/${encodeURIComponent(jobNumber)}/track`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
        setError(false);
        setLastUpdated(new Date());
      } else {
        if (showLoading) setError(true);
      }
    } catch {
      if (showLoading) setError(true);
    } finally {
      setLoading(false);
    }
  }, [jobNumber]);

  useEffect(() => {
    fetchTracking(true);
  }, [fetchTracking]);

  // Auto-refresh every 15 seconds for active deliveries
  useEffect(() => {
    if (!data) return;
    const isActive = ACTIVE_STATUSES.includes(data.delivery.status);
    if (!isActive) return;

    const interval = setInterval(() => fetchTracking(false), 15_000);
    return () => clearInterval(interval);
  }, [data, fetchTracking]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Nav />
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-gray-200 rounded" />
            <div className="h-40 bg-gray-200 rounded-xl" />
            <div className="h-32 bg-gray-200 rounded-xl" />
            <div className="h-48 bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <div className="max-w-2xl mx-auto px-4 py-8">
        {error || !data ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <XCircle className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Delivery Not Found</h2>
            <p className="text-gray-500 mb-6">
              We could not find a delivery with tracking number{" "}
              <span className="font-mono font-semibold">{jobNumber}</span>.
            </p>
            <Link href="/track" className="inline-flex items-center bg-violet-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-violet-700">
              Try Again
            </Link>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <Package className="h-4 w-4" /> Tracking Number
                </div>
                <h1 className="text-2xl font-bold text-gray-900 font-mono">{data.delivery.job_number}</h1>
              </div>
              <div className="text-right">
                {ACTIVE_STATUSES.includes(data.delivery.status) && (
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    <span>Auto-refreshing</span>
                  </div>
                )}
                {lastUpdated && (
                  <div className="text-xs text-gray-400 mt-1">
                    Updated {lastUpdated.toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>

            {/* Status Badge */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-500 mb-1">Current Status</div>
                  <span className={`text-lg font-bold ${statusConfig[data.delivery.status]?.color || "text-gray-900"}`}>
                    {statusConfig[data.delivery.status]?.label || data.delivery.status}
                  </span>
                </div>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${statusConfig[data.delivery.status]?.bgColor || "bg-gray-100"}`}>
                  {["delivered", "completed"].includes(data.delivery.status) ? (
                    <CheckCircle2 className={`h-7 w-7 ${statusConfig[data.delivery.status]?.color}`} />
                  ) : ["cancelled", "failed"].includes(data.delivery.status) ? (
                    <XCircle className={`h-7 w-7 ${statusConfig[data.delivery.status]?.color}`} />
                  ) : ["returning", "returned"].includes(data.delivery.status) ? (
                    <Undo2 className={`h-7 w-7 ${statusConfig[data.delivery.status]?.color}`} />
                  ) : (
                    <Truck className={`h-7 w-7 ${statusConfig[data.delivery.status]?.color}`} />
                  )}
                </div>
              </div>

              {!["cancelled", "failed", "returning", "returned"].includes(data.delivery.status) && (
                <div className="mt-5">
                  <div className="flex gap-1">
                    {statusOrder.map((step, i) => {
                      const currentIdx = statusOrder.indexOf(data.delivery.status);
                      return <div key={step} className={`flex-1 h-2 rounded-full ${i <= currentIdx ? "bg-violet-500" : "bg-gray-200"}`} />;
                    })}
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-gray-400">
                    <span>Ordered</span><span>Assigned</span><span>Picked Up</span><span>In Transit</span><span>Delivered</span><span>Done</span>
                  </div>
                </div>
              )}
            </div>

            {/* Estimated delivery date */}
            {data.delivery.estimated_delivery_date && !["completed", "delivered", "returned"].includes(data.delivery.status) && (
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-6 flex items-center gap-3">
                <Clock className="h-5 w-5 text-violet-600 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-violet-900">Estimated Delivery</div>
                  <div className="text-sm text-violet-700">
                    {new Date(data.delivery.estimated_delivery_date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  </div>
                </div>
              </div>
            )}

            {/* Delivery Details */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
              <h2 className="font-semibold text-gray-900 mb-4">Delivery Details</h2>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-gray-400">Pickup City</div>
                    <div className="text-sm text-gray-700">{data.delivery.pickup_city || "N/A"}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-gray-400">Delivery Address</div>
                    <div className="text-sm text-gray-700">{data.delivery.delivery_address}</div>
                  </div>
                </div>
                {data.delivery.package_description && (
                  <div className="flex items-start gap-3">
                    <Package className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-gray-400">Package</div>
                      <div className="text-sm text-gray-700">{data.delivery.package_description} ({data.delivery.package_size})</div>
                    </div>
                  </div>
                )}
                {data.delivery.actual_delivery_time && (
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-gray-400">Delivered At</div>
                      <div className="text-sm text-gray-700">{new Date(data.delivery.actual_delivery_time).toLocaleString()}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Driver Info */}
            {data.delivery.driver && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
                <h2 className="font-semibold text-gray-900 mb-4">Your Driver</h2>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-violet-100 rounded-full flex items-center justify-center">
                    <User className="h-6 w-6 text-violet-600" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{data.delivery.driver.name}</div>
                    <div className="text-sm text-gray-500 capitalize flex items-center gap-1">
                      <Truck className="h-3.5 w-3.5" /> {data.delivery.driver.vehicle_type}
                    </div>
                  </div>
                  <a href={`tel:${data.delivery.driver.phone}`} className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center hover:bg-green-200">
                    <Phone className="h-5 w-5 text-green-600" />
                  </a>
                </div>
              </div>
            )}

            {/* Tracking Timeline */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Tracking Timeline</h2>
              {data.tracking.length === 0 ? (
                <p className="text-sm text-gray-500">No tracking updates yet.</p>
              ) : (
                <div className="space-y-0">
                  {[...data.tracking].reverse().map((update, i) => {
                    const isFirst = i === 0;
                    const isLast = i === data.tracking.length - 1;
                    return (
                      <div key={update.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-1.5 ${isFirst ? "bg-violet-500" : "bg-gray-300"}`} />
                          {!isLast && <div className="w-0.5 flex-1 bg-gray-200 my-1" />}
                        </div>
                        <div className="pb-6">
                          <div className={`text-sm font-medium ${isFirst ? "text-gray-900" : "text-gray-600"}`}>
                            {statusConfig[update.status]?.label || update.status.replace(/_/g, " ")}
                          </div>
                          {update.message && <div className="text-sm text-gray-500 mt-0.5">{update.message}</div>}
                          {update.location_name && (
                            <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {update.location_name}
                            </div>
                          )}
                          <div className="text-xs text-gray-400 mt-1">{new Date(update.created_at).toLocaleString()}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Report Issue Button — shown after delivery is completed */}
            {["delivered", "completed"].includes(data.delivery.status) && (
              <ReportIssueButton deliveryId={data.delivery.id} jobNumber={data.delivery.job_number} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ReportIssueButton({ deliveryId, jobNumber }: { deliveryId: string; jobNumber: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("not_received");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const types = [
    { value: "not_received", label: "I didn't receive my package" },
    { value: "wrong_item", label: "Wrong item delivered" },
    { value: "damaged", label: "Package was damaged" },
    { value: "late_delivery", label: "Delivery was too late" },
    { value: "overcharged", label: "I was overcharged" },
    { value: "other", label: "Other issue" },
  ];

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: deliveryId, type, description }),
      });
      if (res.ok) {
        setResult({ ok: true, msg: "Your issue has been reported. Our team will investigate and get back to you." });
      } else {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        setResult({ ok: false, msg: err.error || "Failed to submit" });
      }
    } catch {
      setResult({ ok: false, msg: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  if (result?.ok) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700">
        <CheckCircle2 className="h-4 w-4 inline mr-2" />
        {result.msg}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {!open ? (
        <button onClick={() => setOpen(true)} className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors">
          <XCircle className="h-4 w-4" /> Report an Issue
        </button>
      ) : (
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-900 text-sm">Report Issue — {jobNumber}</h3>
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Describe your issue..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          {result && !result.ok && <p className="text-sm text-red-600">{result.msg}</p>}
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button onClick={handleSubmit} disabled={submitting || !description.trim()} className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
              {submitting ? "Submitting..." : "Submit Report"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Nav() {
  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link href="/" className="flex items-center gap-2">
            <Truck className="h-7 w-7 text-violet-600" />
            <span className="text-xl font-bold text-gray-900">Peeap Shipping</span>
          </Link>
          <Link href="/track" className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> New Search
          </Link>
        </div>
      </div>
    </nav>
  );
}
