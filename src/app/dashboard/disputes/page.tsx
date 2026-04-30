"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, Clock, Eye, MessageSquare, XCircle } from "lucide-react";

interface Dispute {
  id: string;
  job_id: string;
  opened_by: string;
  type: string;
  description: string;
  status: string;
  priority: string;
  resolution_notes: string | null;
  refund_amount: number;
  created_at: string;
  resolved_at: string | null;
  delivery?: {
    id: string;
    job_number: string;
    customer_name: string;
    merchant_name: string;
    status: string;
    shipping_fee: number;
  };
}

const statusColors: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  investigating: "bg-yellow-100 text-yellow-700",
  resolved_refund: "bg-green-100 text-green-700",
  resolved_no_action: "bg-gray-100 text-gray-600",
  resolved_warning: "bg-orange-100 text-orange-700",
  closed: "bg-gray-100 text-gray-500",
};

const typeLabels: Record<string, string> = {
  not_received: "Not Received",
  wrong_item: "Wrong Item",
  damaged: "Damaged",
  late_delivery: "Late Delivery",
  overcharged: "Overcharged",
  other: "Other",
};

function getToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|; )peeap_shipping_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("open");
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => { loadDisputes(); }, [statusFilter]);

  async function loadDisputes() {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/disputes?status=${statusFilter}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setDisputes(data.disputes || []);
      }
    } catch (err) {
      console.error("Failed to load disputes:", err);
    } finally {
      setLoading(false);
    }
  }

  async function updateDispute(disputeId: string, status: string, notes?: string, refundAmount?: number) {
    setResolving(disputeId);
    try {
      const token = getToken();
      const res = await fetch("/api/disputes", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          dispute_id: disputeId,
          status,
          resolution_notes: notes,
          refund_amount: refundAmount,
        }),
      });
      if (res.ok) loadDisputes();
    } catch (err) {
      console.error("Failed to update dispute:", err);
    } finally {
      setResolving(null);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-gray-200 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Disputes</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="open">Open</option>
          <option value="investigating">Investigating</option>
          <option value="all">All</option>
        </select>
      </div>

      {disputes.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No disputes found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {disputes.map((d) => (
            <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <span className="font-semibold text-gray-900">{typeLabels[d.type] || d.type}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[d.status] || "bg-gray-100"}`}>
                      {d.status.replace(/_/g, " ")}
                    </span>
                    {d.priority === "high" || d.priority === "urgent" ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">{d.priority}</span>
                    ) : null}
                  </div>
                  {d.delivery && (
                    <div className="text-sm text-gray-500 mt-1">
                      Job: <span className="font-mono">{d.delivery.job_number}</span> — {d.delivery.customer_name} — Le {d.delivery.shipping_fee}
                    </div>
                  )}
                </div>
                <div className="text-xs text-gray-400">
                  {new Date(d.created_at).toLocaleDateString()}
                </div>
              </div>

              <p className="text-sm text-gray-700 mb-3">{d.description}</p>

              {d.resolution_notes && (
                <div className="bg-gray-50 rounded-lg p-3 mb-3">
                  <div className="text-xs text-gray-500 mb-1">Resolution</div>
                  <p className="text-sm text-gray-700">{d.resolution_notes}</p>
                  {d.refund_amount > 0 && (
                    <p className="text-sm font-medium text-green-600 mt-1">Refunded: Le {d.refund_amount.toFixed(2)}</p>
                  )}
                </div>
              )}

              {(d.status === "open" || d.status === "investigating") && (
                <div className="flex gap-2 mt-3">
                  {d.status === "open" && (
                    <button
                      onClick={() => updateDispute(d.id, "investigating")}
                      disabled={resolving === d.id}
                      className="flex items-center gap-1 px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-lg text-sm font-medium hover:bg-yellow-200"
                    >
                      <Eye className="h-3.5 w-3.5" /> Investigate
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const notes = prompt("Resolution notes:");
                      if (notes) {
                        const refund = prompt("Refund amount (0 for none):");
                        updateDispute(d.id, refund && parseFloat(refund) > 0 ? "resolved_refund" : "resolved_no_action", notes, parseFloat(refund || "0"));
                      }
                    }}
                    disabled={resolving === d.id}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200"
                  >
                    <CheckCircle className="h-3.5 w-3.5" /> Resolve
                  </button>
                  <button
                    onClick={() => updateDispute(d.id, "closed", "Closed without action")}
                    disabled={resolving === d.id}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200"
                  >
                    <XCircle className="h-3.5 w-3.5" /> Close
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
