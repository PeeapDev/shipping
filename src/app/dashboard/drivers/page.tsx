"use client";

import { useEffect, useState } from "react";
import {
  User,
  Star,
  Truck,
  Bike,
  Car,
  Footprints,
  MapPin,
  Phone,
  Package,
  Search,
} from "lucide-react";
import type { Driver } from "@/types/shipping";

const vehicleIcons: Record<string, React.ElementType> = {
  motorcycle: Bike,
  car: Car,
  bicycle: Bike,
  foot: Footprints,
};

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadDrivers();
  }, []);

  async function loadDrivers() {
    setLoading(true);
    try {
      const res = await fetch("/api/drivers");
      if (res.ok) {
        const data = await res.json();
        setDrivers(data.drivers || []);
      }
    } catch (err) {
      console.error("Failed to load drivers:", err);
    } finally {
      setLoading(false);
    }
  }

  async function toggleAvailability(driverId: string, available: boolean) {
    try {
      const res = await fetch("/api/drivers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_available: !available }),
      });
      if (res.ok) loadDrivers();
    } catch {}
  }

  const filteredDrivers = searchQuery
    ? drivers.filter(
        (d) =>
          d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (d.city || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.phone.includes(searchQuery)
      )
    : drivers;

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-48 bg-gray-200 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Drivers</h1>
        <div className="text-sm text-gray-500">
          {drivers.filter((d) => d.is_available).length} of {drivers.length}{" "}
          available
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search drivers by name, city, or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
        />
      </div>

      {/* Driver cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredDrivers.map((driver) => {
          const VehicleIcon = vehicleIcons[driver.vehicle_type] || Truck;
          return (
            <div
              key={driver.id}
              className="bg-white rounded-xl border border-gray-200 p-5"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 bg-violet-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="h-6 w-6 text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 truncate">
                      {driver.name}
                    </span>
                    <span
                      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                        driver.is_available ? "bg-green-500" : "bg-gray-300"
                      }`}
                    />
                  </div>
                  <div className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
                    <VehicleIcon className="h-3.5 w-3.5" />
                    <span className="capitalize">{driver.vehicle_type}</span>
                    {driver.vehicle_plate && (
                      <span className="text-gray-400">
                        ({driver.vehicle_plate})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-900">
                    {driver.total_deliveries}
                  </div>
                  <div className="text-xs text-gray-400">Deliveries</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-900 flex items-center justify-center gap-0.5">
                    <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                    {driver.average_rating.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-400">Rating</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-900">
                    Le {(driver.total_earnings / 1000).toFixed(1)}k
                  </div>
                  <div className="text-xs text-gray-400">Earned</div>
                </div>
              </div>

              {/* Info */}
              <div className="space-y-2 text-sm">
                {driver.city && (
                  <div className="flex items-center gap-2 text-gray-500">
                    <MapPin className="h-3.5 w-3.5" />
                    {driver.city}
                  </div>
                )}
                <div className="flex items-center gap-2 text-gray-500">
                  <Phone className="h-3.5 w-3.5" />
                  {driver.phone}
                </div>
              </div>

              {/* Status badge + toggle */}
              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                    driver.is_available
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {driver.is_available ? "Available" : "Busy"}
                </span>
                <button
                  onClick={() => toggleAvailability(driver.id, driver.is_available)}
                  className="text-xs text-violet-600 hover:text-violet-700 font-medium"
                >
                  Toggle
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
