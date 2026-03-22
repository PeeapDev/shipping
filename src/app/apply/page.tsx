"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Truck,
  Bike,
  Car,
  Footprints,
  MapPin,
  FileText,
  Upload,
  CheckCircle2,
  Clock,
  XCircle,
  LogIn,
  Loader2,
  ArrowLeft,
  User,
  Phone,
  Mail,
  Briefcase,
} from "lucide-react";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL || "https://auth.peeap.com";
const SHIPPING_URL = process.env.NEXT_PUBLIC_SHIPPING_URL || "https://peeap-shipping.vercel.app";

function getAuthToken(): string | null {
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/peeap_token=([^;]+)/);
    if (match) return match[1];
  }
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem("peeap_auth_token");
  }
  return null;
}

interface UserInfo {
  sub: string;
  email?: string;
  phone?: string;
  name?: string;
}

export default function ApplyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    }>
      <ApplyPageInner />
    </Suspense>
  );
}

function ApplyPageInner() {
  const searchParams = useSearchParams();

  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [existingApp, setExistingApp] = useState<any>(null);
  const [checkingApp, setCheckingApp] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [vehicleType, setVehicleType] = useState("motorcycle");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [experienceYears, setExperienceYears] = useState(0);
  const [bio, setBio] = useState("");
  const [availableHours, setAvailableHours] = useState("full_time");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Check auth on mount
  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      // Validate token by calling our API
      fetch("/api/apply", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error("Unauthorized");
        })
        .then((data) => {
          setUser({ sub: "authenticated" });
          if (data.application) {
            setExistingApp(data.application);
          }
        })
        .catch(() => {
          setUser(null);
        })
        .finally(() => {
          setAuthLoading(false);
        });
    } else {
      // Try exchanging token from URL
      const code = searchParams.get("token");
      if (code) {
        fetch(`${AUTH_URL}/api/auth/exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, client: "shipping" }),
        })
          .then((res) => res.ok ? res.json() : Promise.reject())
          .then((data) => {
            const accessToken = data.access_token || data.session_token;
            localStorage.setItem("peeap_auth_token", accessToken);
            setUser({
              sub: data.user.id,
              email: data.user.email,
              phone: data.user.phone,
              name: [data.user.first_name, data.user.last_name].filter(Boolean).join(" "),
            });
            // Pre-fill form from profile
            if (data.user.first_name || data.user.last_name) {
              setName([data.user.first_name, data.user.last_name].filter(Boolean).join(" "));
            }
            if (data.user.phone) setPhone(data.user.phone);
            if (data.user.email) setEmail(data.user.email);

            // Clean URL
            const url = new URL(window.location.href);
            url.searchParams.delete("token");
            window.history.replaceState({}, "", url.toString());

            // Check existing application
            checkExistingApplication(accessToken);
          })
          .catch(() => setUser(null))
          .finally(() => setAuthLoading(false));
      } else {
        setAuthLoading(false);
      }
    }
  }, [searchParams]);

  async function checkExistingApplication(token: string) {
    setCheckingApp(true);
    try {
      const res = await fetch("/api/apply", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.application) setExistingApp(data.application);
      }
    } catch {} finally {
      setCheckingApp(false);
    }
  }

  function handleLogin() {
    const redirectUrl = `${SHIPPING_URL}/apply`;
    window.location.href = `${AUTH_URL}/login?client=shipping&redirect=${encodeURIComponent(redirectUrl)}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");
    setSubmitting(true);

    const token = getAuthToken();
    if (!token) {
      setSubmitError("Please log in first.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          city: city.trim(),
          vehicle_type: vehicleType,
          vehicle_plate: vehiclePlate.trim() || undefined,
          experience_years: experienceYears,
          bio: bio.trim() || undefined,
          available_hours: availableHours,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error || "Failed to submit application");
        return;
      }

      setSubmitted(true);
      setExistingApp(data.application);
    } catch {
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  // Existing application status
  if (existingApp) {
    const statusConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
      pending: { icon: Clock, color: "text-yellow-600", bg: "bg-yellow-100", label: "Under Review" },
      under_review: { icon: FileText, color: "text-blue-600", bg: "bg-blue-100", label: "Under Review" },
      approved: { icon: CheckCircle2, color: "text-green-600", bg: "bg-green-100", label: "Approved" },
      rejected: { icon: XCircle, color: "text-red-600", bg: "bg-red-100", label: "Rejected" },
    };
    const s = statusConfig[existingApp.status] || statusConfig.pending;
    const Icon = s.icon;

    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b border-gray-200">
          <div className="max-w-3xl mx-auto px-4 h-16 flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <Truck className="h-7 w-7 text-violet-600" />
              <span className="text-xl font-bold text-gray-900">Peeap Shipping</span>
            </Link>
          </div>
        </nav>
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <div className="bg-white rounded-2xl p-8 shadow-sm">
            <div className={`w-16 h-16 ${s.bg} rounded-full flex items-center justify-center mx-auto mb-4`}>
              <Icon className={`w-8 h-8 ${s.color}`} />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Application {s.label}</h2>
            {existingApp.status === "pending" || existingApp.status === "under_review" ? (
              <p className="text-gray-500 mb-4">
                Your application is being reviewed by our team. We&apos;ll notify you once a decision is made.
              </p>
            ) : existingApp.status === "approved" ? (
              <p className="text-gray-500 mb-4">
                Congratulations! You&apos;ve been approved as a Peeap rider. You can now start accepting deliveries.
              </p>
            ) : (
              <>
                <p className="text-gray-500 mb-2">Unfortunately your application was not approved.</p>
                {existingApp.rejection_reason && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mb-4">
                    {existingApp.rejection_reason}
                  </p>
                )}
              </>
            )}
            <div className="text-xs text-gray-400 mt-4">
              Applied on {new Date(existingApp.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b border-gray-200">
          <div className="max-w-3xl mx-auto px-4 h-16 flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <Truck className="h-7 w-7 text-violet-600" />
              <span className="text-xl font-bold text-gray-900">Peeap Shipping</span>
            </Link>
          </div>
        </nav>
        <div className="max-w-md mx-auto px-4 py-16 text-center">
          <div className="bg-white rounded-2xl p-8 shadow-sm">
            <div className="w-16 h-16 bg-violet-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bike className="w-8 h-8 text-violet-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Become a Peeap Rider</h2>
            <p className="text-gray-500 mb-6">
              To apply as a delivery rider, you need a Peeap account. Sign in or create one to get started.
            </p>
            <button
              onClick={handleLogin}
              className="w-full bg-violet-600 text-white py-3 rounded-lg font-semibold hover:bg-violet-700 transition-colors flex items-center justify-center gap-2"
            >
              <LogIn className="w-5 h-5" />
              Login with Peeap
            </button>
            <p className="text-xs text-gray-400 mt-4">
              Don&apos;t have an account?{" "}
              <a
                href={`${AUTH_URL}/register?client=shipping&redirect=${encodeURIComponent(`${SHIPPING_URL}/apply`)}`}
                className="text-violet-600 hover:underline"
              >
                Create one for free
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Submitted success
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b border-gray-200">
          <div className="max-w-3xl mx-auto px-4 h-16 flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <Truck className="h-7 w-7 text-violet-600" />
              <span className="text-xl font-bold text-gray-900">Peeap Shipping</span>
            </Link>
          </div>
        </nav>
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <div className="bg-white rounded-2xl p-8 shadow-sm">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Application Submitted!</h2>
            <p className="text-gray-500">
              Thank you for applying. Our team will review your application and documents. You&apos;ll be notified once a decision is made.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Application form
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Truck className="h-7 w-7 text-violet-600" />
            <span className="text-xl font-bold text-gray-900">Peeap Shipping</span>
          </Link>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="w-8 h-8 bg-violet-100 rounded-full flex items-center justify-center">
              <User className="h-4 w-4 text-violet-600" />
            </div>
            <span className="hidden sm:inline">
              {user.name || user.email || user.phone || "Logged in"}
            </span>
          </div>
        </div>
      </nav>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bike className="h-7 w-7 text-violet-600" />
            Apply as a Rider
          </h1>
          <p className="text-gray-500 mt-1">
            Fill in your details and our team will review your application.
          </p>
        </div>

        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            {submitError}
          </div>
        )}

        {/* Personal Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <User className="h-5 w-5 text-violet-600" />
            Personal Information
          </h2>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                placeholder="Your full name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                placeholder="+232 76 123456"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                placeholder="email@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
              <input
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                placeholder="e.g. Freetown, Bo, Kenema"
              />
            </div>
          </div>
        </div>

        {/* Vehicle Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Truck className="h-5 w-5 text-violet-600" />
            Vehicle & Availability
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Vehicle Type *</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { value: "motorcycle", label: "Motorcycle", icon: Bike },
                { value: "car", label: "Car", icon: Car },
                { value: "bicycle", label: "Bicycle", icon: Bike },
                { value: "foot", label: "On Foot", icon: Footprints },
              ].map((v) => {
                const VIcon = v.icon;
                return (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => setVehicleType(v.value)}
                    className={`p-4 border-2 rounded-xl text-center transition-colors ${
                      vehicleType === v.value
                        ? "border-violet-500 bg-violet-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <VIcon className={`h-6 w-6 mx-auto mb-1 ${vehicleType === v.value ? "text-violet-600" : "text-gray-400"}`} />
                    <span className="text-sm font-medium">{v.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {(vehicleType === "motorcycle" || vehicleType === "car") && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Plate</label>
                <input
                  type="text"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                  placeholder="e.g. AKA-1234"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Experience (years)</label>
              <input
                type="number"
                min="0"
                max="50"
                value={experienceYears}
                onChange={(e) => setExperienceYears(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Availability *</label>
              <select
                value={availableHours}
                onChange={(e) => setAvailableHours(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
              >
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="weekends">Weekends Only</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">About You</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about your experience, why you want to be a rider..."
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none resize-none"
            />
          </div>
        </div>

        {/* Documents Notice */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="h-5 w-5 text-violet-600" />
            Documents
          </h2>
          <p className="text-sm text-gray-500">
            Make sure your Peeap profile is complete with your ID card and profile photo.
            Our team will review your Peeap profile as part of the application. You can update your
            profile at{" "}
            <a href="https://my.peeap.com/settings/profile" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline">
              my.peeap.com
            </a>
          </p>
          <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-sm text-violet-700">
            Tip: Upload your CV, drivers license, and vehicle photos to your Peeap profile for faster approval.
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-violet-600 text-white py-3.5 rounded-xl font-semibold text-lg hover:bg-violet-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Briefcase className="h-5 w-5" />
              Submit Application
            </>
          )}
        </button>
      </form>
    </div>
  );
}
