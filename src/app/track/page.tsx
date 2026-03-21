"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Truck, Search, Package } from "lucide-react";
import Link from "next/link";

export default function TrackSearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const [query, setQuery] = useState(initialQuery);
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setError("Please enter a tracking number.");
      return;
    }
    setError("");
    router.push(`/track/${encodeURIComponent(trimmed)}`);
  }

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
          </div>
        </div>
      </nav>

      <div className="max-w-xl mx-auto px-4 py-20">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package className="h-8 w-8 text-violet-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Track Your Delivery
          </h1>
          <p className="text-gray-500 mt-2">
            Enter your tracking number to see real-time delivery updates.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setError("");
              }}
              placeholder="e.g. SHP-20260321-A1B2"
              className="w-full pl-12 pr-4 py-4 border border-gray-300 rounded-xl text-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
              autoFocus
            />
          </div>
          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}
          <button
            type="submit"
            className="w-full bg-violet-600 text-white py-4 rounded-xl font-semibold text-lg hover:bg-violet-700 transition-colors"
          >
            Track Package
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-6">
          Your tracking number was sent to you via SMS or email when your order
          was placed.
        </p>
      </div>
    </div>
  );
}
