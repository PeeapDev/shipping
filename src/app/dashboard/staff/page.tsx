"use client";

import { useEffect, useState } from "react";
import {
  UserCog,
  Plus,
  Phone,
  Mail,
  Shield,
  X,
} from "lucide-react";

interface StaffMember {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

const roleColors: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  manager: "bg-blue-100 text-blue-700",
  dispatcher: "bg-green-100 text-green-700",
};

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    role: "dispatcher",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadStaff();
  }, []);

  async function loadStaff() {
    setLoading(true);
    try {
      const res = await fetch("/api/staff");
      if (res.ok) {
        const data = await res.json();
        setStaff(data.staff || []);
      }
    } catch (err) {
      console.error("Failed to load staff:", err);
    } finally {
      setLoading(false);
    }
  }

  async function addStaff(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setFormData({ name: "", email: "", phone: "", role: "dispatcher" });
        setShowForm(false);
        loadStaff();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to add staff");
      }
    } catch {
      alert("Failed to add staff member");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      const res = await fetch("/api/staff", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active: !isActive }),
      });
      if (res.ok) loadStaff();
    } catch {}
  }

  async function changeRole(id: string, newRole: string) {
    try {
      const res = await fetch("/api/staff", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, role: newRole }),
      });
      if (res.ok) loadStaff();
    } catch {}
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-gray-200 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Staff Management</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 text-sm bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-700"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? "Cancel" : "Add Staff"}
        </button>
      </div>

      {/* Add Staff Form */}
      {showForm && (
        <form
          onSubmit={addStaff}
          className="bg-white rounded-xl border border-gray-200 p-5 space-y-4"
        >
          <h2 className="font-semibold text-gray-900">Add Staff Member</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Role *</label>
              <select
                value={formData.role}
                onChange={(e) =>
                  setFormData({ ...formData, role: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
              >
                <option value="dispatcher">Dispatcher</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                placeholder="email@example.com"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                placeholder="+23276..."
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="bg-violet-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
          >
            {saving ? "Adding..." : "Add Staff Member"}
          </button>
        </form>
      )}

      {/* Staff List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {staff.length === 0 ? (
          <div className="p-12 text-center">
            <UserCog className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No staff members yet.</p>
            <p className="text-sm text-gray-400 mt-1">
              Add your first staff member to get started.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {staff.map((member) => (
              <div
                key={member.id}
                className="p-4 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-violet-100 rounded-full flex items-center justify-center">
                    <Shield className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">
                      {member.name}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                      {member.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {member.email}
                        </span>
                      )}
                      {member.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {member.phone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <select
                    value={member.role}
                    onChange={(e) => changeRole(member.id, e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-violet-500 outline-none"
                  >
                    <option value="dispatcher">Dispatcher</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${
                      roleColors[member.role] || "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {member.role}
                  </span>
                  <button
                    onClick={() => toggleActive(member.id, member.is_active)}
                    className={`text-xs px-2 py-1 rounded-lg font-medium ${
                      member.is_active
                        ? "text-red-600 hover:bg-red-50"
                        : "text-green-600 hover:bg-green-50"
                    }`}
                  >
                    {member.is_active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
