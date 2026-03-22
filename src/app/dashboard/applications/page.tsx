"use client";

import { useEffect, useState } from "react";
import {
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Phone,
  Mail,
  MapPin,
  Truck,
  Briefcase,
  ChevronDown,
  ExternalLink,
} from "lucide-react";

interface Application {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string;
  vehicle_type: string;
  vehicle_plate: string | null;
  experience_years: number;
  bio: string | null;
  available_hours: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  under_review: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadApplications();
  }, [statusFilter]);

  async function loadApplications() {
    setLoading(true);
    try {
      const res = await fetch(`/api/applications?status=${statusFilter}`);
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications || []);
      }
    } catch (err) {
      console.error("Failed to load applications:", err);
    } finally {
      setLoading(false);
    }
  }

  async function reviewApplication(appId: string, action: "approve" | "reject") {
    let rejectionReason: string | undefined;
    if (action === "reject") {
      rejectionReason = prompt("Reason for rejection:") || undefined;
      if (!rejectionReason) return;
    }

    setProcessing(appId);
    try {
      const res = await fetch("/api/applications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: appId,
          action,
          rejection_reason: rejectionReason,
        }),
      });
      if (res.ok) {
        loadApplications();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to process application");
      }
    } catch {
      alert("Failed to process application");
    } finally {
      setProcessing(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Driver Applications</h1>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm appearance-none bg-white focus:ring-2 focus:ring-violet-500 outline-none"
          >
            <option value="pending">Pending</option>
            <option value="under_review">Under Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-gray-200 rounded-xl" />
          ))}
        </div>
      ) : applications.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No {statusFilter} applications.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => (
            <div key={app.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-violet-100 rounded-full flex items-center justify-center">
                    <User className="h-6 w-6 text-violet-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{app.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[app.status] || "bg-gray-100 text-gray-600"}`}>
                        {app.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{app.phone}</span>
                      {app.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{app.email}</span>}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-gray-400">
                  {new Date(app.created_at).toLocaleDateString()}
                </div>
              </div>

              <div className="grid md:grid-cols-4 gap-3 mb-4 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  {app.city}
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Truck className="h-4 w-4 text-gray-400" />
                  <span className="capitalize">{app.vehicle_type}</span>
                  {app.vehicle_plate && <span className="text-gray-400">({app.vehicle_plate})</span>}
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Briefcase className="h-4 w-4 text-gray-400" />
                  {app.experience_years} yr{app.experience_years !== 1 ? "s" : ""} experience
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span className="capitalize">{app.available_hours.replace(/_/g, " ")}</span>
                </div>
              </div>

              {app.bio && (
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 mb-4">{app.bio}</p>
              )}

              {/* View Peeap Profile link */}
              <a
                href={`https://my.peeap.com/admin/users/${app.user_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-violet-600 hover:text-violet-700 flex items-center gap-1 mb-4"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View Peeap Profile & Documents
              </a>

              {/* Actions */}
              {(app.status === "pending" || app.status === "under_review") && (
                <div className="flex gap-2 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => reviewApplication(app.id, "approve")}
                    disabled={processing === app.id}
                    className="flex items-center gap-1.5 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Approve
                  </button>
                  <button
                    onClick={() => reviewApplication(app.id, "reject")}
                    disabled={processing === app.id}
                    className="flex items-center gap-1.5 bg-white text-red-600 border border-red-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </button>
                </div>
              )}

              {app.rejection_reason && (
                <p className="text-sm text-red-600 mt-3">Reason: {app.rejection_reason}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
