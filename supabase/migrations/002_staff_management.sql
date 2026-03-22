-- Staff management for shipping platform
CREATE TABLE shipping_staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    role VARCHAR(50) NOT NULL DEFAULT 'dispatcher', -- dispatcher, manager, admin
    is_active BOOLEAN DEFAULT true,
    permissions JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_staff_user ON shipping_staff(user_id);
CREATE INDEX idx_staff_role ON shipping_staff(role);
