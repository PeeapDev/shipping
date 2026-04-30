import { z } from "zod";

// ── Delivery job schemas ──

export const createDeliveryJobSchema = z.object({
  // Accept null/undefined — upstream API sends null when there's no order/transaction yet
  store_order_id: z.string().uuid().nullish().transform((v) => v ?? undefined),
  transaction_id: z.string().uuid().nullish().transform((v) => v ?? undefined),
  merchant_id: z.string().uuid(),
  merchant_name: z.string().max(255).optional(),
  customer_id: z.string().uuid(),
  customer_name: z.string().min(1).max(255),
  customer_phone: z.string().min(1).max(50),
  // Pickup
  pickup_address: z.string().min(1),
  pickup_city: z.string().max(100).optional(),
  pickup_lat: z.number().min(-90).max(90).optional(),
  pickup_lng: z.number().min(-180).max(180).optional(),
  pickup_instructions: z.string().optional(),
  // Delivery
  delivery_address: z.string().min(1),
  delivery_city: z.string().max(100).optional(),
  delivery_lat: z.number().min(-90).max(90).optional(),
  delivery_lng: z.number().min(-180).max(180).optional(),
  delivery_instructions: z.string().optional(),
  // Scheduling
  preferred_date: z.string().optional(),
  preferred_time_slot: z
    .enum(["morning", "afternoon", "evening"])
    .optional(),
  // Financials
  shipping_fee: z.number().min(0).default(0),
  driver_payout: z.number().min(0).optional(),
  platform_fee: z.number().min(0).optional(),
  // Package
  package_description: z.string().optional(),
  package_weight_kg: z.number().min(0).optional(),
  package_size: z
    .enum(["small", "medium", "large", "extra_large"])
    .default("medium"),
  requires_signature: z.boolean().default(false),
  // COD (Cash on Delivery)
  is_cod: z.boolean().default(false),
  cod_amount: z.number().min(0).default(0),
  // Items & metadata
  items: z.array(z.any()).default([]),
  metadata: z.record(z.any()).default({}),
});

export const updateDeliveryStatusSchema = z.object({
  status: z.enum([
    "pending",
    "assigned",
    "picked_up",
    "in_transit",
    "delivered",
    "completed",
    "cancelled",
    "failed",
    "returning",
    "returned",
  ]),
  driver_id: z.string().uuid().optional(),
  cancel_reason: z.string().optional(),
  failure_reason: z.string().optional(),
  return_reason: z.string().optional(),
  proof_of_delivery_url: z.string().url().optional(),
});

// ── Tracking update schemas ──

export const addTrackingUpdateSchema = z.object({
  status: z.string().min(1).max(30),
  message: z.string().optional(),
  location_lat: z.number().min(-90).max(90).optional(),
  location_lng: z.number().min(-180).max(180).optional(),
  location_name: z.string().max(255).optional(),
});

// ── Driver schemas ──

export const registerDriverSchema = z.object({
  name: z.string().min(1).max(255),
  phone: z.string().min(1).max(50),
  email: z.string().email().max(255).optional(),
  vehicle_type: z
    .enum(["motorcycle", "car", "bicycle", "foot"])
    .default("motorcycle"),
  vehicle_plate: z.string().max(50).optional(),
  profile_picture: z.string().url().optional(),
  city: z.string().max(100).optional(),
});

export const updateDriverSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  phone: z.string().min(1).max(50).optional(),
  email: z.string().email().max(255).optional(),
  vehicle_type: z
    .enum(["motorcycle", "car", "bicycle", "foot"])
    .optional(),
  vehicle_plate: z.string().max(50).optional(),
  profile_picture: z.string().url().optional(),
  city: z.string().max(100).optional(),
  is_available: z.boolean().optional(),
  current_lat: z.number().min(-90).max(90).optional(),
  current_lng: z.number().min(-180).max(180).optional(),
});

// ── Quote schema ──

export const quoteRequestSchema = z.object({
  pickup_city: z.string().min(1),
  delivery_city: z.string().min(1),
  package_size: z
    .enum(["small", "medium", "large", "extra_large"])
    .default("medium"),
  // Optional coordinates for distance-based pricing
  pickup_lat: z.number().min(-90).max(90).optional(),
  pickup_lng: z.number().min(-180).max(180).optional(),
  delivery_lat: z.number().min(-90).max(90).optional(),
  delivery_lng: z.number().min(-180).max(180).optional(),
});

// ── Driver location update ──

export const driverLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

// ── Driver online/offline toggle ──

export const driverOnlineSchema = z.object({
  is_online: z.boolean(),
});

// ── Rate delivery ──

export const rateDeliverySchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

// ── Dispatch settings ──

export const dispatchSettingsSchema = z.object({
  dispatch_radius_km: z.number().min(1).max(100).optional(),
  offer_timeout_seconds: z.number().min(15).max(300).optional(),
  max_dispatch_attempts: z.number().int().min(1).max(10).optional(),
  platform_fee_pct: z.number().min(0).max(100).optional(),
  driver_payout_pct: z.number().min(0).max(100).optional(),
  min_driver_rating: z.number().min(0).max(5).optional(),
});

// ── Driver application (apply) ──

export const applySchema = z.object({
  name: z.string().min(1).max(255),
  phone: z.string().min(1).max(50),
  email: z.string().email().max(255).optional(),
  city: z.string().min(1).max(100),
  vehicle_type: z
    .enum(["motorcycle", "car", "bicycle", "foot"])
    .default("motorcycle"),
  vehicle_plate: z.string().max(50).optional(),
  experience_years: z.number().int().min(0).max(50).optional(),
  bio: z.string().max(1000).optional(),
  available_hours: z
    .enum(["full_time", "part_time", "weekends"])
    .default("full_time"),
});
