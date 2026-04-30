-- =============================================================================
-- Migration 004: Driver Dispatch, Job Offers, Payouts & Enhanced Driver Fields
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. driver_job_offers — dispatch offers sent to drivers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_job_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES delivery_jobs(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  offered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '60 seconds'),
  distance_km DECIMAL(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(job_id, driver_id)
);

CREATE INDEX idx_job_offers_driver_status ON driver_job_offers(driver_id, status);
CREATE INDEX idx_job_offers_job_status ON driver_job_offers(job_id, status);
CREATE INDEX idx_job_offers_expires ON driver_job_offers(expires_at) WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 2. driver_payouts — earnings and payout tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  job_id UUID REFERENCES delivery_jobs(id) ON DELETE SET NULL,
  amount DECIMAL(12,2) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'earning'
    CHECK (type IN ('earning', 'payout', 'bonus', 'deduction', 'tip')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  wallet_transaction_id UUID,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payouts_driver_date ON driver_payouts(driver_id, created_at DESC);
CREATE INDEX idx_payouts_status ON driver_payouts(status) WHERE status IN ('pending', 'processing');

-- ---------------------------------------------------------------------------
-- 3. Enhance delivery_jobs — dispatch mode, fee split, attempts
-- ---------------------------------------------------------------------------
ALTER TABLE delivery_jobs
  ADD COLUMN IF NOT EXISTS dispatch_mode VARCHAR(20) DEFAULT 'manual'
    CHECK (dispatch_mode IN ('manual', 'auto', 'broadcast')),
  ADD COLUMN IF NOT EXISTS dispatch_attempts INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS merchant_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS platform_fee_pct DECIMAL(5,2) DEFAULT 20.00,
  ADD COLUMN IF NOT EXISTS driver_chat_conversation_id UUID,
  ADD COLUMN IF NOT EXISTS rated BOOLEAN DEFAULT false;

-- ---------------------------------------------------------------------------
-- 4. Enhance drivers — online status, active job, location timestamp
-- ---------------------------------------------------------------------------
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS active_job_id UUID REFERENCES delivery_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS max_concurrent_jobs INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fcm_token TEXT,
  ADD COLUMN IF NOT EXISTS device_info JSONB;

CREATE INDEX idx_drivers_online_available ON drivers(is_online, is_available, city)
  WHERE is_active = true;
CREATE INDEX idx_drivers_location ON drivers(current_lat, current_lng)
  WHERE is_online = true AND is_available = true;

-- ---------------------------------------------------------------------------
-- 5. Shipping settings — configurable platform-wide settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipping_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Default settings
INSERT INTO shipping_settings (key, value, description) VALUES
  ('dispatch_radius_km', '10', 'Max radius in km for auto-dispatch driver search'),
  ('offer_timeout_seconds', '60', 'Seconds before a job offer expires'),
  ('max_dispatch_attempts', '3', 'Max drivers to offer before flagging for manual dispatch'),
  ('platform_fee_pct', '20', 'Default platform fee percentage'),
  ('driver_payout_pct', '80', 'Default driver payout percentage'),
  ('min_driver_rating', '3.0', 'Minimum rating for auto-dispatch eligibility')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Add driver_ratings completion trigger
-- ---------------------------------------------------------------------------
-- Function to recalculate driver average rating after a new rating is inserted
CREATE OR REPLACE FUNCTION update_driver_average_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE drivers
  SET
    average_rating = (
      SELECT COALESCE(AVG(rating), 0)
      FROM driver_ratings
      WHERE driver_id = NEW.driver_id
    ),
    total_ratings = (
      SELECT COUNT(*)
      FROM driver_ratings
      WHERE driver_id = NEW.driver_id
    ),
    updated_at = now()
  WHERE id = NEW.driver_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_driver_rating ON driver_ratings;
CREATE TRIGGER trg_update_driver_rating
  AFTER INSERT ON driver_ratings
  FOR EACH ROW
  EXECUTE FUNCTION update_driver_average_rating();

-- ---------------------------------------------------------------------------
-- 7. Auto-expire pending job offers (can be called by cron or application)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION expire_stale_job_offers()
RETURNS INT AS $$
DECLARE
  expired_count INT;
BEGIN
  UPDATE driver_job_offers
  SET status = 'expired', responded_at = now()
  WHERE status = 'pending' AND expires_at < now();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;
