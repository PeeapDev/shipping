-- Delivery drivers
CREATE TABLE drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, -- links to main peeap user
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    vehicle_type VARCHAR(50) DEFAULT 'motorcycle', -- motorcycle, car, bicycle, foot
    vehicle_plate VARCHAR(50),
    profile_picture TEXT,
    city VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    is_available BOOLEAN DEFAULT true,
    current_lat DECIMAL(10,7),
    current_lng DECIMAL(10,7),
    total_deliveries INTEGER DEFAULT 0,
    total_earnings DECIMAL(15,2) DEFAULT 0,
    average_rating DECIMAL(3,2) DEFAULT 0,
    total_ratings INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Delivery jobs
CREATE TABLE delivery_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_number VARCHAR(50) NOT NULL UNIQUE,
    store_order_id UUID, -- links to peeap-pos store_orders
    transaction_id UUID, -- links to main peeap transactions
    merchant_id UUID NOT NULL,
    merchant_name VARCHAR(255),
    customer_id UUID NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    driver_id UUID REFERENCES drivers(id),
    -- Pickup
    pickup_address TEXT NOT NULL,
    pickup_city VARCHAR(100),
    pickup_lat DECIMAL(10,7),
    pickup_lng DECIMAL(10,7),
    pickup_instructions TEXT,
    -- Delivery
    delivery_address TEXT NOT NULL,
    delivery_city VARCHAR(100),
    delivery_lat DECIMAL(10,7),
    delivery_lng DECIMAL(10,7),
    delivery_instructions TEXT,
    -- Scheduling
    preferred_date DATE,
    preferred_time_slot VARCHAR(50), -- 'morning', 'afternoon', 'evening'
    estimated_pickup_time TIMESTAMPTZ,
    estimated_delivery_time TIMESTAMPTZ,
    actual_pickup_time TIMESTAMPTZ,
    actual_delivery_time TIMESTAMPTZ,
    -- Financials
    shipping_fee DECIMAL(15,2) NOT NULL DEFAULT 0,
    driver_payout DECIMAL(15,2) DEFAULT 0,
    platform_fee DECIMAL(15,2) DEFAULT 0,
    -- Status
    status VARCHAR(30) DEFAULT 'pending',
    -- pending -> assigned -> picked_up -> in_transit -> delivered -> completed / cancelled / failed
    cancel_reason TEXT,
    failure_reason TEXT,
    -- Package details
    package_description TEXT,
    package_weight_kg DECIMAL(5,2),
    package_size VARCHAR(20) DEFAULT 'medium', -- small, medium, large, extra_large
    requires_signature BOOLEAN DEFAULT false,
    proof_of_delivery_url TEXT,
    -- Metadata
    items JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_delivery_jobs_status ON delivery_jobs(status);
CREATE INDEX idx_delivery_jobs_driver ON delivery_jobs(driver_id);
CREATE INDEX idx_delivery_jobs_customer ON delivery_jobs(customer_id);
CREATE INDEX idx_delivery_jobs_merchant ON delivery_jobs(merchant_id);
CREATE INDEX idx_delivery_jobs_store_order ON delivery_jobs(store_order_id);

-- Tracking updates (timeline)
CREATE TABLE tracking_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES delivery_jobs(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL,
    message TEXT,
    location_lat DECIMAL(10,7),
    location_lng DECIMAL(10,7),
    location_name VARCHAR(255),
    updated_by UUID, -- driver or system
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tracking_updates_job ON tracking_updates(job_id);

-- Driver ratings
CREATE TABLE driver_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES delivery_jobs(id),
    driver_id UUID NOT NULL REFERENCES drivers(id),
    customer_id UUID NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Delivery zones & pricing
CREATE TABLE delivery_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    base_fee DECIMAL(15,2) NOT NULL DEFAULT 10,
    per_km_fee DECIMAL(15,2) DEFAULT 2,
    min_fee DECIMAL(15,2) DEFAULT 5,
    max_fee DECIMAL(15,2) DEFAULT 100,
    estimated_time_minutes INTEGER DEFAULT 60,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
