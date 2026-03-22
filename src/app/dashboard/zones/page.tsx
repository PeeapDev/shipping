"use client";

import { useEffect, useState } from "react";
import { Map, DollarSign, Clock, MapPin } from "lucide-react";
import type { DeliveryZone } from "@/types/shipping";

export default function ZonesPage() {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadZones();
  }, []);

  async function loadZones() {
    setLoading(true);
    try {
      const res = await fetch("/api/zones");
      if (res.ok) {
        const data = await res.json();
        setZones(data.zones || []);
      }
    } catch (err) {
      console.error("Failed to load zones:", err);
    } finally {
      setLoading(false);
    }
  }

  // Group zones by city
  const grouped = zones.reduce(
    (acc, zone) => {
      if (!acc[zone.city]) acc[zone.city] = [];
      acc[zone.city].push(zone);
      return acc;
    },
    {} as Record<string, DeliveryZone[]>
  );

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-gray-200 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Delivery Zones</h1>
        <div className="text-sm text-gray-500">
          {zones.length} active zones
        </div>
      </div>

      {Object.entries(grouped).map(([city, cityZones]) => (
        <div key={city}>
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="h-5 w-5 text-violet-600" />
            <h2 className="text-lg font-semibold text-gray-900">{city}</h2>
            <span className="text-sm text-gray-400">
              ({cityZones.length} zones)
            </span>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cityZones.map((zone) => (
              <div
                key={zone.id}
                className="bg-white rounded-xl border border-gray-200 p-5"
              >
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
                    <Map className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{zone.name}</h3>
                    <span
                      className={`text-xs font-medium ${
                        zone.is_active
                          ? "text-green-600"
                          : "text-gray-400"
                      }`}
                    >
                      {zone.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5" />
                      Base Fee
                    </span>
                    <span className="font-medium text-gray-900">
                      Le {zone.base_fee.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Per KM</span>
                    <span className="font-medium text-gray-900">
                      Le {zone.per_km_fee.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Fee Range</span>
                    <span className="text-gray-600">
                      Le {zone.min_fee.toFixed(2)} - Le {zone.max_fee.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Est. Time
                    </span>
                    <span className="font-medium text-gray-900">
                      {zone.estimated_time_minutes} min
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
