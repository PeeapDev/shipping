-- =============================================================================
-- Migration 005: Pickup & Delivery Verification Codes
-- =============================================================================
-- Two 4-digit codes per delivery:
--   pickup_code: given to vendor, rider enters to confirm pickup
--   delivery_code: given to buyer, rider enters to confirm delivery

ALTER TABLE delivery_jobs
  ADD COLUMN IF NOT EXISTS pickup_code VARCHAR(4),
  ADD COLUMN IF NOT EXISTS delivery_code VARCHAR(4),
  ADD COLUMN IF NOT EXISTS pickup_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS estimated_delivery_date DATE;

-- Partial index for code lookups (only active jobs)
CREATE INDEX IF NOT EXISTS idx_jobs_pickup_code
  ON delivery_jobs(pickup_code) WHERE status IN ('pending', 'assigned');

CREATE INDEX IF NOT EXISTS idx_jobs_delivery_code
  ON delivery_jobs(delivery_code) WHERE status IN ('picked_up', 'in_transit');
