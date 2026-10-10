"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Truck,
  LayoutDashboard,
  PackageCheck,
  List,
  Users,
  UserCog,
  FileText,
  Map,
  Settings,
  ChevronLeft,
  Menu,
  X,
  User,
  MessageSquare,
  ScanLine,
} from "lucide-react";
import { useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { AccountActions } from "@/components/AccountActions";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/dispatch", label: "Dispatch", icon: ScanLine },
  { href: "/dashboard/active", label: "Active Deliveries", icon: PackageCheck },
  { href: "/dashboard/jobs", label: "All Jobs", icon: List },
  { href: "/dashboard/drivers", label: "Drivers", icon: Users },
  { href: "/dashboard/applications", label: "Applications", icon: FileText },
  { href: "/dashboard/messages", label: "Messages", icon: MessageSquare },
  { href: "/dashboard/disputes", label: "Disputes", icon: FileText },
  { href: "/dashboard/zones", label: "Pricing & zones", icon: Map },
  { href: "/dashboard/staff", label: "Staff", icon: UserCog },
  { href: "/dashboard/analytics", label: "Analytics", icon: List },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, loading } = useAuth();

  return (
    <div className="min-h-screen flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-white border-r border-gray-200 flex flex-col transform transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="h-16 border-b border-gray-200 flex items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Truck className="h-7 w-7 text-violet-600" />
            <span className="font-bold text-gray-900">Peeap Shipping</span>
          </Link>
          <button
            className="lg:hidden text-gray-400 hover:text-gray-600"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-violet-50 text-violet-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User info + logout */}
        <div className="p-4 border-t border-gray-200 space-y-3">
          {user && (
            <div className="flex items-center gap-3">
              {user.profile_picture ? (
                <img
                  src={user.profile_picture}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 bg-violet-100 rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-violet-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {user.name || user.email}
                </div>
                <div className="text-xs text-gray-500 capitalize">
                  {user.role}
                </div>
              </div>
            </div>
          )}
          <AccountActions />
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        {/* Top bar */}
        <div className="h-16 border-b border-gray-200 flex items-center justify-between px-4 bg-white">
          <div className="flex items-center">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-gray-600 hover:text-gray-900 mr-3"
            >
              <Menu className="h-6 w-6" />
            </button>
            <span className="lg:hidden font-semibold text-gray-900">Peeap Shipping</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/messages"
              className="relative p-2 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
              title="Messages"
            >
              <MessageSquare className="h-5 w-5" />
            </Link>
            <Link
              href="/dashboard/disputes"
              className="relative p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
              title="Disputes"
            >
              <FileText className="h-5 w-5" />
            </Link>
            {user && (
              <div className="ml-2 flex items-center gap-2 pl-2 border-l border-gray-200">
                {user.profile_picture ? (
                  <img src={user.profile_picture} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 bg-violet-100 rounded-full flex items-center justify-center">
                    <User className="h-4 w-4 text-violet-600" />
                  </div>
                )}
                <span className="hidden md:block text-sm font-medium text-gray-700">{user.name || user.email}</span>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 md:p-6 lg:p-8">{loading ? <p role="status" className="text-gray-500">Checking your shipping account…</p> : user ? children : <section className="rounded-xl border bg-white p-6"><h1 className="text-xl font-semibold">Signed out of shipping</h1><p className="mt-2 text-gray-600">Use Switch account in the menu to sign in with a different Peeap account. Staff access is checked after sign-in.</p></section>}</div>
      </main>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
