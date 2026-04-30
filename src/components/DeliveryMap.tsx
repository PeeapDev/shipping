"use client";

import { useEffect, useRef, useState } from "react";
import type { DeliveryJob } from "@/types/shipping";
import { MapPin } from "lucide-react";

// Sierra Leone bounds
const SL_BOUNDS = {
  south: 6.85,
  north: 10.0,
  west: -13.5,
  east: -10.25,
};
const SL_CENTER = { lat: 8.46, lng: -13.23 }; // Freetown

const statusColors: Record<string, string> = {
  pending: "#EAB308",
  assigned: "#3B82F6",
  picked_up: "#6366F1",
  in_transit: "#8B5CF6",
  returning: "#F59E0B",
};

interface Props {
  jobs: DeliveryJob[];
}

export function DeliveryMap({ jobs }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Load Leaflet CSS
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    // Load Leaflet JS
    if (!(window as any).L) {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = () => initMap();
      document.head.appendChild(script);
    } else {
      initMap();
    }

    function initMap() {
      const L = (window as any).L;
      if (!L || !mapRef.current) return;

      const map = L.map(mapRef.current, {
        minZoom: 7,
        maxZoom: 18,
        maxBounds: L.latLngBounds(
          L.latLng(SL_BOUNDS.south, SL_BOUNDS.west),
          L.latLng(SL_BOUNDS.north, SL_BOUNDS.east)
        ),
        maxBoundsViscosity: 1.0,
      }).setView([SL_CENTER.lat, SL_CENTER.lng], 12);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
        maxZoom: 18,
      }).addTo(map);

      mapInstanceRef.current = map;
      setMapLoaded(true);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update markers when jobs change
  useEffect(() => {
    if (!mapInstanceRef.current || !mapLoaded) return;
    const L = (window as any).L;
    const map = mapInstanceRef.current;

    // Clear existing markers
    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];

    // Group jobs by merchant for aggregation
    const merchantJobs: Record<string, { jobs: DeliveryJob[]; lat: number; lng: number; name: string }> = {};

    jobs.forEach((job) => {
      const lat = job.pickup_lat || null;
      const lng = job.pickup_lng || null;
      const merchantKey = job.merchant_id || job.job_number;
      const name = job.merchant_name || job.pickup_address || "Store";

      if (lat && lng) {
        if (!merchantJobs[merchantKey]) {
          merchantJobs[merchantKey] = { jobs: [], lat, lng, name };
        }
        merchantJobs[merchantKey].jobs.push(job);
      }

      // Delivery location marker
      if (job.delivery_lat && job.delivery_lng) {
        const color = statusColors[job.status] || "#6B7280";
        const deliveryIcon = L.divIcon({
          className: "custom-marker",
          html: `<div style="
            width: 28px; height: 28px; border-radius: 50%;
            background: ${color}; border: 3px solid white;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            display: flex; align-items: center; justify-content: center;
            font-size: 10px; font-weight: bold; color: white;
          ">📦</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        const marker = L.marker([job.delivery_lat, job.delivery_lng], { icon: deliveryIcon }).addTo(map);
        marker.bindPopup(`
          <div style="min-width:150px">
            <b>${job.job_number}</b><br/>
            <span style="color:#666">📍 ${job.delivery_address || job.delivery_city || "Delivery"}</span><br/>
            <span style="color:#666">👤 ${job.customer_name || "Customer"}</span><br/>
            <span style="background:${color};color:white;padding:2px 8px;border-radius:10px;font-size:11px">
              ${job.status.replace(/_/g, " ")}
            </span>
          </div>
        `);
        markersRef.current.push(marker);
      }
    });

    // Merchant pickup markers with pending count bubbles
    Object.entries(merchantJobs).forEach(([key, data]) => {
      const count = data.jobs.length;
      const merchantIcon = L.divIcon({
        className: "custom-marker",
        html: `<div style="position:relative">
          <div style="
            width: 36px; height: 36px; border-radius: 50%;
            background: linear-gradient(135deg, #7c3aed, #6d28d9);
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            display: flex; align-items: center; justify-content: center;
            font-size: 14px; color: white;
          ">🏪</div>
          ${count > 0 ? `<div style="
            position: absolute; top: -6px; right: -6px;
            width: 20px; height: 20px; border-radius: 50%;
            background: #EF4444; color: white;
            font-size: 11px; font-weight: bold;
            display: flex; align-items: center; justify-content: center;
            border: 2px solid white;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          ">${count}</div>` : ""}
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const marker = L.marker([data.lat, data.lng], { icon: merchantIcon }).addTo(map);
      marker.bindPopup(`
        <div style="min-width:160px">
          <b>🏪 ${data.name}</b><br/>
          <span style="color:#7c3aed;font-weight:bold">${count} pending pickup${count > 1 ? "s" : ""}</span><br/>
          <div style="margin-top:4px;font-size:11px;color:#666">
            ${data.jobs.map((j) => `${j.job_number} → ${j.customer_name || "Customer"}`).join("<br/>")}
          </div>
        </div>
      `);
      markersRef.current.push(marker);
    });

    // Draw route lines between pickup and delivery
    jobs.forEach((job) => {
      if (job.pickup_lat && job.pickup_lng && job.delivery_lat && job.delivery_lng) {
        const color = statusColors[job.status] || "#6B7280";
        const line = L.polyline(
          [[job.pickup_lat, job.pickup_lng], [job.delivery_lat, job.delivery_lng]],
          { color, weight: 2, opacity: 0.5, dashArray: "6 4" }
        ).addTo(map);
        markersRef.current.push(line);
      }
    });
  }, [jobs, mapLoaded]);

  return (
    <div className="relative">
      <div ref={mapRef} className="h-72 w-full" style={{ zIndex: 1 }} />
      {jobs.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80 z-10">
          <div className="text-center text-gray-400">
            <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No active deliveries to show</p>
          </div>
        </div>
      )}
    </div>
  );
}
