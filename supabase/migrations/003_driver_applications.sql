-- Driver applications - requires Peeap user account
CREATE TABLE driver_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- Peeap user ID (must have account)
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    vehicle_type VARCHAR(50) NOT NULL DEFAULT 'motorcycle',
    vehicle_plate VARCHAR(50),
    -- Documents
    id_card_url TEXT,
    drivers_license_url TEXT,
    vehicle_photo_url TEXT,
    profile_photo_url TEXT,
    cv_url TEXT,
    -- Application details
    experience_years INTEGER DEFAULT 0,
    bio TEXT,
    available_hours VARCHAR(50) DEFAULT 'full_time', -- full_time, part_time, weekends
    -- Status
    status VARCHAR(30) DEFAULT 'pending', -- pending, under_review, approved, rejected
    rejection_reason TEXT,
    reviewed_by UUID, -- staff who reviewed
    reviewed_at TIMESTAMPTZ,
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_driver_applications_user ON driver_applications(user_id);
CREATE INDEX idx_driver_applications_status ON driver_applications(status);
