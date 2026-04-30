-- =============================================================================
-- Migration 007: RBAC, Staff Invitations, Disputes, COD, Audit Log
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Staff invitations (POS-style flow: company invites → user accepts)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,                -- invited Peeap user
  invited_by UUID NOT NULL,             -- staff who sent invite
  role VARCHAR(20) NOT NULL DEFAULT 'dispatcher'
    CHECK (role IN ('dispatcher', 'manager', 'admin')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  message TEXT,                          -- optional invite message
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, status) -- one pending invite per user
);

CREATE INDEX idx_invitations_user ON staff_invitations(user_id, status);

-- ---------------------------------------------------------------------------
-- 2. Disputes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES delivery_jobs(id) ON DELETE CASCADE,
  opened_by UUID NOT NULL,              -- customer or merchant user_id
  type VARCHAR(30) NOT NULL
    CHECK (type IN ('not_received', 'wrong_item', 'damaged', 'late_delivery', 'overcharged', 'other')),
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'resolved_refund', 'resolved_no_action', 'resolved_warning', 'closed')),
  priority VARCHAR(10) DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to UUID,                     -- staff member investigating
  resolution_notes TEXT,
  refund_amount DECIMAL(12,2) DEFAULT 0,
  evidence JSONB DEFAULT '[]',          -- [{url, type, uploaded_by, uploaded_at}]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_disputes_job ON disputes(job_id);
CREATE INDEX idx_disputes_status ON disputes(status) WHERE status IN ('open', 'investigating');

-- ---------------------------------------------------------------------------
-- 3. COD (Cash on Delivery) support
-- ---------------------------------------------------------------------------
ALTER TABLE delivery_jobs
  ADD COLUMN IF NOT EXISTS is_cod BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS cod_amount DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cod_collected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS cod_collected_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 4. Audit log — every staff action recorded
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL,               -- who did it
  actor_email VARCHAR(255),
  actor_role VARCHAR(30),
  action VARCHAR(50) NOT NULL,          -- e.g. 'approve_application', 'assign_driver'
  resource_type VARCHAR(30) NOT NULL,   -- e.g. 'delivery', 'driver', 'application'
  resource_id UUID,
  details JSONB DEFAULT '{}',           -- action-specific data
  ip_address VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_actor ON audit_log(actor_id, created_at DESC);
CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_action ON audit_log(action, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. Add role permissions reference (defines what each role can do)
-- ---------------------------------------------------------------------------
INSERT INTO shipping_settings (key, value, description) VALUES
  ('role_permissions', '{
    "dispatcher": ["view_deliveries", "view_drivers", "assign_driver", "manual_dispatch", "view_tracking"],
    "manager": ["view_deliveries", "view_drivers", "assign_driver", "manual_dispatch", "view_tracking", "approve_applications", "reject_applications", "view_applications", "manage_zones", "view_staff", "resolve_disputes"],
    "admin": ["*"]
  }', 'Role-based permissions for shipping staff')
ON CONFLICT (key) DO NOTHING;
