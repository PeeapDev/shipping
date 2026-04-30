"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  UserCog,
  Plus,
  Phone,
  Mail,
  Shield,
  X,
  Search,
  Loader2,
  UserPlus,
  Check,
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

interface PeeapUser {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
}

const roleColors: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  manager: "bg-blue-100 text-blue-700",
  dispatcher: "bg-green-100 text-green-700",
};

function getAuthToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )peeap_shipping_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddPanel, setShowAddPanel] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PeeapUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Add staff state
  const [selectedUser, setSelectedUser] = useState<PeeapUser | null>(null);
  const [selectedRole, setSelectedRole] = useState("dispatcher");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadStaff();
  }, []);

  async function loadStaff() {
    setLoading(true);
    try {
      const res = await fetch("/api/staff", { headers: authHeaders() });
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

  const searchUsers = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      setSearchError("");
      return;
    }

    setSearching(true);
    setSearchError("");

    try {
      const res = await fetch(
        `/api/staff/search?q=${encodeURIComponent(query.trim())}`,
        { headers: authHeaders() }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSearchError(err.error || "Search failed");
        setSearchResults([]);
        return;
      }

      const data = await res.json();
      setSearchResults(data.users || []);
    } catch {
      setSearchError("Failed to search users");
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  function handleSearchInput(value: string) {
    setSearchQuery(value);
    setSelectedUser(null);
    setAddError("");
    setAddSuccess("");

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (value.trim().length < 2) {
      setSearchResults([]);
      setSearchError("");
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchUsers(value);
    }, 400);
  }

  function selectUser(user: PeeapUser) {
    setSelectedUser(user);
    setSearchResults([]);
    setSearchQuery("");
    setAddError("");
    setAddSuccess("");
  }

  async function addStaffMember() {
    if (!selectedUser) return;

    setAdding(true);
    setAddError("");
    setAddSuccess("");

    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          user_id: selectedUser.id,
          role: selectedRole,
          name: selectedUser.fullName,
          email: selectedUser.email,
          phone: selectedUser.phone,
        }),
      });

      if (res.ok) {
        setAddSuccess(`${selectedUser.fullName} added as ${selectedRole}`);
        setSelectedUser(null);
        setSelectedRole("dispatcher");
        loadStaff();
        // Auto-hide success after 3 seconds
        setTimeout(() => setAddSuccess(""), 3000);
      } else {
        const err = await res.json().catch(() => ({}));
        setAddError(err.error || "Failed to add staff member");
      }
    } catch {
      setAddError("Failed to add staff member");
    } finally {
      setAdding(false);
    }
  }

  function closeAddPanel() {
    setShowAddPanel(false);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedUser(null);
    setAddError("");
    setAddSuccess("");
    setSelectedRole("dispatcher");
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      const res = await fetch("/api/staff", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ id, is_active: !isActive }),
      });
      if (res.ok) loadStaff();
    } catch {}
  }

  async function changeRole(id: string, newRole: string) {
    try {
      const res = await fetch("/api/staff", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ id, role: newRole }),
      });
      if (res.ok) loadStaff();
    } catch {}
  }

  // Check if a Peeap user is already staff
  function isAlreadyStaff(userId: string): boolean {
    return staff.some((s) => s.user_id === userId && s.is_active);
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
          onClick={() => (showAddPanel ? closeAddPanel() : setShowAddPanel(true))}
          className="flex items-center gap-2 text-sm bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-700"
        >
          {showAddPanel ? (
            <X className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {showAddPanel ? "Cancel" : "Add Staff"}
        </button>
      </div>

      {/* Add Staff Panel */}
      {showAddPanel && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-violet-600" />
            Add Peeap User as Staff
          </h2>
          <p className="text-sm text-gray-500">
            Search for an existing Peeap user by name, phone number, or email address.
          </p>

          {/* Success Message */}
          {addSuccess && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <Check className="h-4 w-4 flex-shrink-0" />
              {addSuccess}
            </div>
          )}

          {/* Error Message */}
          {addError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {addError}
            </div>
          )}

          {/* Selected User Preview */}
          {selectedUser ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-lg p-4">
                {selectedUser.avatarUrl ? (
                  <img
                    src={selectedUser.avatarUrl}
                    alt=""
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 bg-violet-200 rounded-full flex items-center justify-center">
                    <span className="text-violet-700 font-semibold text-lg">
                      {selectedUser.fullName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900">
                    {selectedUser.fullName}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                    {selectedUser.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {selectedUser.phone}
                      </span>
                    )}
                    {selectedUser.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {selectedUser.email}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedUser(null);
                    setAddError("");
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                  >
                    <option value="dispatcher">Dispatcher</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <button
                  onClick={addStaffMember}
                  disabled={adding}
                  className="flex items-center gap-2 bg-violet-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
                >
                  {adding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  {adding ? "Adding..." : "Add as Staff"}
                </button>
              </div>
            </div>
          ) : (
            /* Search Input */
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  placeholder="Search by phone number, email, or name..."
                  className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                  autoFocus
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-violet-500 animate-spin" />
                )}
              </div>

              {/* Search Error */}
              {searchError && (
                <p className="text-sm text-red-500 mt-2">{searchError}</p>
              )}

              {/* Search Results Dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {searchResults.map((user) => {
                    const alreadyStaff = isAlreadyStaff(user.id);
                    return (
                      <button
                        key={user.id}
                        onClick={() => !alreadyStaff && selectUser(user)}
                        disabled={alreadyStaff}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                          alreadyStaff
                            ? "opacity-50 cursor-not-allowed bg-gray-50"
                            : "hover:bg-violet-50 cursor-pointer"
                        }`}
                      >
                        {user.avatarUrl ? (
                          <img
                            src={user.avatarUrl}
                            alt=""
                            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-gray-600 font-medium">
                              {user.fullName.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {user.fullName}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                            {user.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {user.phone}
                              </span>
                            )}
                            {user.email && (
                              <span className="flex items-center gap-1 truncate">
                                <Mail className="h-3 w-3 flex-shrink-0" />
                                {user.email}
                              </span>
                            )}
                          </div>
                        </div>
                        {alreadyStaff ? (
                          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full flex-shrink-0">
                            Already staff
                          </span>
                        ) : (
                          <UserPlus className="h-4 w-4 text-violet-400 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* No results message */}
              {searchQuery.trim().length >= 2 &&
                !searching &&
                searchResults.length === 0 &&
                !searchError && (
                  <p className="text-sm text-gray-500 mt-3 text-center py-4">
                    No Peeap users found for &quot;{searchQuery}&quot;
                  </p>
                )}
            </div>
          )}
        </div>
      )}

      {/* Staff List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {staff.length === 0 ? (
          <div className="p-12 text-center">
            <UserCog className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No staff members yet.</p>
            <p className="text-sm text-gray-400 mt-1">
              Add your first staff member by searching for a Peeap user.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {staff.map((member) => (
              <div
                key={member.id}
                className={`p-4 flex items-center justify-between hover:bg-gray-50 ${
                  !member.is_active ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-violet-100 rounded-full flex items-center justify-center">
                    <Shield className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">
                      {member.name}
                      {!member.is_active && (
                        <span className="ml-2 text-xs text-gray-400 font-normal">
                          (inactive)
                        </span>
                      )}
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
