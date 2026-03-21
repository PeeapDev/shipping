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
      // Placeholder data
      setDrivers([
        {
          id: "d1",
          user_id: "u1",
          name: "Alhaji Conteh",
          phone: "+23276999888",
          email: "alhaji@email.com",
          vehicle_type: "motorcycle",
          vehicle_plate: "AGA-1234",
          profile_picture: null,
          city: "Freetown",
          is_active: true,
          is_available: false,
          current_lat: null,
          current_lng: null,
          total_deliveries: 234,
          total_earnings: 5400,
          average_rating: 4.7,
          total_ratings: 180,
          created_at: "2026-01-15T10:00:00Z",
          updated_at: "2026-03-21T08:00:00Z",
        },
        {
          id: "d2",
          user_id: "u2",
          name: "Mariatu Kamara",
          phone: "+23278555444",
          email: null,
          vehicle_type: "bicycle",
          vehicle_plate: null,
          profile_picture: null,
          city: "Freetown",
          is_active: true,
          is_available: true,
          current_lat: null,
          current_lng: null,
          total_deliveries: 89,
          total_earnings: 1800,
          average_rating: 4.9,
          total_ratings: 75,
          created_at: "2026-02-01T10:00:00Z",
          updated_at: "2026-03-21T09:00:00Z",
        },
        {
          id: "d3",
          user_id: "u3",
          name: "Samuel Johnson",
          phone: "+23277333222",
          email: "sam.j@email.com",
          vehicle_type: "car",
          vehicle_plate: "ABC-5678",
          profile_picture: null,
          city: "Bo",
          is_active: true,
          is_available: true,
          current_lat: null,
          current_lng: null,
          total_deliveries: 156,
          total_earnings: 3900,
          average_rating: 4.5,
          total_ratings: 120,
          created_at: "2026-01-20T10:00:00Z",
          updated_at: "2026-03-20T16:00:00Z",
        },
        {
          id: "d4",
          user_id: "u4",
          name: "Fatmata Bangura",
          phone: "+23276111222",
          email: null,
          vehicle_type: "foot",
          vehicle_plate: null,
          profile_picture: null,
          city: "Freetown",
          is_active: true,
          is_available: true,
          current_lat: null,
          current_lng: null,
          total_deliveries: 45,
          total_earnings: 800,
          average_rating: 5.0,
          total_ratings: 40,
          created_at: "2026-03-01T10:00:00Z",
          updated_at: "2026-03-21T07:00:00Z",
        },
      ]);
    } finally {
      setLoading(false);
    }
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

              {/* Status badge */}
              <div className="mt-4 pt-3 border-t border-gray-100">
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                    driver.is_available
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {driver.is_available ? "Available" : "Busy"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
