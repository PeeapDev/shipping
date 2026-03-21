// ── Driver ──

export interface Driver {
  id: string;
  user_id: string | null;
  name: string;
  phone: string;
  email: string | null;
  vehicle_type: "motorcycle" | "car" | "bicycle" | "foot";
  vehicle_plate: string | null;
  profile_picture: string | null;
  city: string | null;
  is_active: boolean;
  is_available: boolean;
  current_lat: number | null;
  current_lng: number | null;
  total_deliveries: number;
  total_earnings: number;
  average_rating: number;
  total_ratings: number;
  created_at: string;
  updated_at: string;
}

// ── Delivery Job ──

export type DeliveryStatus =
  | "pending"
  | "assigned"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "completed"
  | "cancelled"
  | "failed";

export type PackageSize = "small" | "medium" | "large" | "extra_large";

export type TimeSlot = "morning" | "afternoon" | "evening";

export interface DeliveryJob {
  id: string;
  job_number: string;
  store_order_id: string | null;
  transaction_id: string | null;
  merchant_id: string;
  merchant_name: string | null;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  driver_id: string | null;
  // Pickup
  pickup_address: string;
  pickup_city: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  pickup_instructions: string | null;
  // Delivery
  delivery_address: string;
  delivery_city: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  delivery_instructions: string | null;
  // Scheduling
  preferred_date: string | null;
  preferred_time_slot: TimeSlot | null;
  estimated_pickup_time: string | null;
  estimated_delivery_time: string | null;
  actual_pickup_time: string | null;
  actual_delivery_time: string | null;
  // Financials
  shipping_fee: number;
  driver_payout: number;
  platform_fee: number;
  // Status
  status: DeliveryStatus;
  cancel_reason: string | null;
  failure_reason: string | null;
  // Package
  package_description: string | null;
  package_weight_kg: number | null;
  package_size: PackageSize;
  requires_signature: boolean;
  proof_of_delivery_url: string | null;
  // Metadata
  items: unknown[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined
  driver?: Driver;
  tracking_updates?: TrackingUpdate[];
}

// ── Tracking Update ──

export interface TrackingUpdate {
  id: string;
  job_id: string;
  status: string;
  message: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_name: string | null;
  updated_by: string | null;
  created_at: string;
}

// ── Driver Rating ──

export interface DriverRating {
  id: string;
  job_id: string;
  driver_id: string;
  customer_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

// ── Delivery Zone ──

export interface DeliveryZone {
  id: string;
  name: string;
  city: string;
  base_fee: number;
  per_km_fee: number;
  min_fee: number;
  max_fee: number;
  estimated_time_minutes: number;
  is_active: boolean;
  created_at: string;
}

// ── Quote ──

export interface ShippingQuote {
  fee: number;
  estimated_time_minutes: number;
  pickup_zone: string | null;
  delivery_zone: string | null;
}

// ── Dashboard Stats ──

export interface DashboardStats {
  active_deliveries: number;
  completed_today: number;
  revenue_today: number;
  total_drivers: number;
  available_drivers: number;
}
