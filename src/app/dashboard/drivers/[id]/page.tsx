"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, User, Truck, Star, Package, DollarSign, Clock,
  CheckCircle, XCircle, TrendingUp, Phone, Mail, MapPin,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

function getToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|; )peeap_shipping_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export default function DriverDetailPage() {
  const params = useParams();
  const driverId = params.id as string;
  const [driver, setDriver] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (driverId) loadDriver();
  }, [driverId]);

  async function loadDriver() {
    try {
      const { data: d } = await supabase.from("drivers").select("*").eq("id", driverId).single();
      setDriver(d);

      // Get delivery history
      const { data: deliveries } = await supabase
        .from("delivery_jobs")
        .select("id, job_number, status, shipping_fee, driver_payout, created_at, actual_pickup_time, actual_delivery_time, customer_name")
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false })
        .limit(50);
      setJobs(deliveries || []);

      // Calculate performance stats
      const completed = (deliveries || []).filter(j => j.status === "completed");
      const failed = (deliveries || []).filter(j => j.status === "failed" || j.status === "cancelled");
      const total = (deliveries || []).length;
      const completionRate = total > 0 ? (completed.length / total) * 100 : 0;

      // Average delivery time
      const deliveryTimes = completed
        .filter(j => j.actual_pickup_time && j.actual_delivery_time)
        .map(j => (new Date(j.actual_delivery_time).getTime() - new Date(j.actual_pickup_time).getTime()) / 60000);
      const avgTime = deliveryTimes.length > 0 ? deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length : 0;

      // Total earnings
      const totalEarnings = completed.reduce((s, j) => s + (parseFloat(String(j.driver_payout)) || 0), 0);

      // Get ratings
      const { data: ratings } = await supabase
        .from("driver_ratings")
        .select("rating, comment, created_at")
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false })
        .limit(20);

      setStats({
        total,
        completed: completed.length,
        failed: failed.length,
        completionRate: Math.round(completionRate),
        avgTime: Math.round(avgTime),
        totalEarnings,
        ratings: ratings || [],
      });
    } catch (err) {
      console.error("Failed to load driver:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        <div className="h-40 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  if (!driver) {
    return <div className="text-center py-12 text-gray-500">Driver not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link href="/dashboard/drivers" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to Drivers
      </Link>

      {/* Driver header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-violet-100 rounded-full flex items-center justify-center">
            {driver.profile_picture ? (
              <img src={driver.profile_picture} alt="" className="w-16 h-16 rounded-full object-cover" />
            ) : (
              <User className="h-8 w-8 text-violet-600" />
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{driver.name}</h1>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
              <span className="flex items-center gap-1"><Truck className="h-3.5 w-3.5" />{driver.vehicle_type}</span>
              {driver.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{driver.city}</span>}
              {driver.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{driver.phone}</span>}
              {driver.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{driver.email}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${driver.is_online ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
              {driver.is_online ? "Online" : "Offline"}
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${driver.is_active ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>
              {driver.is_active ? "Active" : "Deactivated"}
            </span>
          </div>
        </div>
      </div>

      {/* Performance stats */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard icon={Package} label="Total Jobs" value={`${stats.total}`} bg="bg-gray-100" color="text-gray-600" />
        <StatCard icon={CheckCircle} label="Completed" value={`${stats.completed}`} bg="bg-green-100" color="text-green-600" />
        <StatCard icon={XCircle} label="Failed" value={`${stats.failed}`} bg="bg-red-100" color="text-red-600" />
        <StatCard icon={TrendingUp} label="Success Rate" value={`${stats.completionRate}%`} bg="bg-emerald-100" color="text-emerald-600" />
        <StatCard icon={Clock} label="Avg Time" value={stats.avgTime > 0 ? `${stats.avgTime}m` : "N/A"} bg="bg-indigo-100" color="text-indigo-600" />
        <StatCard icon={DollarSign} label="Earnings" value={`Le ${stats.totalEarnings.toLocaleString()}`} bg="bg-amber-100" color="text-amber-600" />
      </div>

      {/* Rating Overview + Distribution */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Star className="h-5 w-5 text-yellow-500" />
          Driver Ratings
        </h2>

        {stats.ratings?.length > 0 ? (
          <>
            {/* Rating summary + distribution */}
            <div className="flex gap-6 mb-5">
              {/* Average */}
              <div className="text-center">
                <div className="text-4xl font-bold text-gray-900">{driver.average_rating > 0 ? driver.average_rating.toFixed(1) : "—"}</div>
                <div className="flex gap-0.5 justify-center mt-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className={`h-4 w-4 ${s <= Math.round(driver.average_rating) ? "text-yellow-400 fill-yellow-400" : "text-gray-200"}`} />
                  ))}
                </div>
                <div className="text-xs text-gray-400 mt-1">{driver.total_ratings} reviews</div>
              </div>

              {/* Distribution bars */}
              <div className="flex-1 space-y-1">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = (stats.ratings || []).filter((r: any) => r.rating === star).length;
                  const pct = stats.ratings.length > 0 ? (count / stats.ratings.length) * 100 : 0;
                  return (
                    <div key={star} className="flex items-center gap-2 text-xs">
                      <span className="w-3 text-gray-500 text-right">{star}</span>
                      <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${star >= 4 ? "bg-green-400" : star === 3 ? "bg-yellow-400" : "bg-red-400"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-6 text-gray-400 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Individual reviews */}
            <div className="border-t border-gray-100 pt-4 space-y-2">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Recent Reviews</h3>
              {stats.ratings.map((r: any, i: number) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${r.rating <= 2 ? "bg-red-50 border border-red-100" : "bg-gray-50"}`}>
                  <div className="flex gap-0.5 mt-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className={`h-3.5 w-3.5 ${s <= r.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} />
                    ))}
                  </div>
                  <div className="flex-1">
                    {r.comment && <p className="text-sm text-gray-700">{r.comment}</p>}
                    {!r.comment && <p className="text-sm text-gray-400 italic">No comment</p>}
                    <p className="text-xs text-gray-400 mt-1">{new Date(r.created_at).toLocaleDateString()}</p>
                  </div>
                  {r.rating <= 2 && (
                    <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">Low</span>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400">No reviews yet</p>
        )}
      </div>

      {/* Recent deliveries */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Recent Deliveries</h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-gray-400">No deliveries yet</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {jobs.slice(0, 20).map((job) => (
              <div key={job.id} className="py-2 flex items-center justify-between">
                <div>
                  <span className="font-mono text-sm text-gray-900">{job.job_number}</span>
                  <span className="text-xs text-gray-500 ml-2">{job.customer_name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    job.status === "completed" ? "bg-green-100 text-green-700" :
                    job.status === "failed" ? "bg-red-100 text-red-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {job.status}
                  </span>
                  {job.driver_payout > 0 && <span className="text-sm font-medium text-gray-700">Le {parseFloat(job.driver_payout).toFixed(0)}</span>}
                  <span className="text-xs text-gray-400">{new Date(job.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, bg, color }: { icon: any; label: string; value: string; bg: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center mb-2`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="text-lg font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  );
}
