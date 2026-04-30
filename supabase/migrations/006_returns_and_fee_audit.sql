-- =============================================================================
-- Migration 006: Product Returns, Fee Audit Trail, Refunds
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend delivery_jobs for return flow
-- ---------------------------------------------------------------------------
ALTER TABLE delivery_jobs
  ADD COLUMN IF NOT EXISTS return_code VARCHAR(4),
  ADD COLUMN IF NOT EXISTS return_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_reason TEXT,
  ADD COLUMN IF NOT EXISTS refund_status VARCHAR(20) DEFAULT NULL
    CHECK (refund_status IS NULL OR refund_status IN ('none', 'pending', 'processing', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(12,2) DEFAULT 0;

-- Update the status CHECK to include new statuses
-- (Postgres doesn't let us ALTER a CHECK easily, so we use a permissive approach
--  and validate in application code)

-- ---------------------------------------------------------------------------
-- 2. Fee audit trail — every fee movement is recorded
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES delivery_jobs(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL
    CHECK (type IN (
      'shipping_fee_collected',    -- customer paid shipping
      'driver_payout',             -- platform → driver wallet
      'platform_fee_collected',    -- platform keeps its cut
      'driver_payout_reversal',    -- reversed on return/fail
      'shipping_fee_refund',       -- refund to customer
      'return_fee'                 -- fee charged for return trip
    )),
  amount DECIMAL(12,2) NOT NULL,
  from_party VARCHAR(30) NOT NULL,  -- 'customer', 'platform', 'driver', 'vendor'
  to_party VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),
  reference TEXT,                    -- external tx id (wallet, payment gateway)
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fee_tx_job ON fee_transactions(job_id);
CREATE INDEX idx_fee_tx_type ON fee_transactions(type, status);
