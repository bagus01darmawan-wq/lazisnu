-- ============================================
-- DATABASE SCHEMA - LAZISNU COLLECTOR APP
-- PostgreSQL 14+
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- ENUM TYPES
-- ============================================

CREATE TYPE user_role AS ENUM (
    'ADMIN_KECAMATAN',
    'ADMIN_RANTING',
    'BENDAHARA',
    'PETUGAS'
);

CREATE TYPE collection_status AS ENUM (
    'PENDING',      -- Sedang dijemput
    'COMPLETED',    -- Selesai dijemput & sync
    'FAILED',       -- Gagal sync
    'CANCELLED'    -- Dibatalkan
);

CREATE TYPE payment_method AS ENUM (
    'CASH',
    'TRANSFER'
);

CREATE TYPE assignment_status AS ENUM (
    'ACTIVE',
    'COMPLETED',
    'POSTPONED',
    'REASSIGNED'
);

-- ============================================
-- TABLES: Geographic Hierarchy
-- ============================================

-- Tabel Kecamatan
CREATE TABLE districts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    region_code VARCHAR(5) NOT NULL,  -- Kode wilayah (untuk QR)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_districts_code ON districts(code);

-- Tabel Ranting
CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    district_id UUID NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
    code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_branches_district ON branches(district_id);
CREATE INDEX idx_branches_code ON branches(code);

-- ============================================
-- TABLES: Users
-- ============================================

-- Tabel Admin (Kecamatan & Ranting) & Bendahara
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    role user_role NOT NULL,
    district_id UUID REFERENCES districts(id),  -- Untuk ADMIN_KECAMATAN & BENDAHARA
    branch_id UUID REFERENCES branches(id),       -- Untuk ADMIN_RANTING
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_district ON users(district_id);
CREATE INDEX idx_users_branch ON users(branch_id);
CREATE INDEX idx_users_phone ON users(phone);

-- Tabel Petugas (petugas lapangan)
CREATE TABLE officers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    employee_code VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    photo_url VARCHAR(500),
    district_id UUID NOT NULL REFERENCES districts(id),
    branch_id UUID NOT NULL REFERENCES branches(id),
    assigned_zone VARCHAR(100),  -- Zona penugasan
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_officers_user ON officers(user_id);
CREATE INDEX idx_officers_district ON officers(district_id);
CREATE INDEX idx_officers_branch ON officers(branch_id);
CREATE INDEX idx_officers_code ON officers(employee_code);

-- ============================================
-- TABLES: Can (Kaleng/Kotak Infaq)
-- ============================================

CREATE TABLE cans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    qr_code VARCHAR(50) UNIQUE NOT NULL,  -- Format: LZNU-{REGION}-{ID}
    branch_id UUID NOT NULL REFERENCES branches(id),
    owner_name VARCHAR(100) NOT NULL,
    owner_phone VARCHAR(20) NOT NULL,
    owner_address TEXT NOT NULL,
    owner_whatsapp VARCHAR(20),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    location_notes TEXT,
    is_active BOOLEAN DEFAULT true,
    last_collected_at TIMESTAMP,
    total_collected DECIMAL(15, 2) DEFAULT 0,
    collection_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cans_qr ON cans(qr_code);
CREATE INDEX idx_cans_branch ON cans(branch_id);
CREATE INDEX idx_cans_owner_phone ON cans(owner_phone);
CREATE INDEX idx_cans_active ON cans(is_active);

-- ============================================
-- TABLES: Assignment (Penugasan)
-- ============================================

CREATE TABLE assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    can_id UUID NOT NULL REFERENCES cans(id) ON DELETE CASCADE,
    officer_id UUID NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
    backup_officer_id UUID REFERENCES officers(id),  -- Petugas cadangan
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL,
    status assignment_status DEFAULT 'ACTIVE',
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Unique constraint: satu kaleng per petugas per bulan
    UNIQUE(can_id, officer_id, period_year, period_month)
);

CREATE INDEX idx_assignments_can ON assignments(can_id);
CREATE INDEX idx_assignments_officer ON assignments(officer_id);
CREATE INDEX idx_assignments_period ON assignments(period_year, period_month);
CREATE INDEX idx_assignments_status ON assignments(status);

-- ============================================
-- TABLES: Collection (Penjemputan)
-- ============================================

CREATE TABLE collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID NOT NULL REFERENCES assignments(id),
    can_id UUID NOT NULL REFERENCES cans(id),
    officer_id UUID NOT NULL REFERENCES officers(id),

    -- Nominal
    amount DECIMAL(15, 2) NOT NULL,
    payment_method payment_method DEFAULT 'CASH',
    transfer_receipt_url VARCHAR(500),  -- Untuk bukti transfer (bukan uang cash)

    -- Timestamp
    collected_at TIMESTAMP NOT NULL,  -- Waktu penjemputan (dari device)
    submitted_at TIMESTAMP,            -- Waktu submit ke server
    synced_at TIMESTAMP,               -- Waktu sync berhasil

    -- Status
    sync_status collection_status DEFAULT 'PENDING',
    server_timestamp TIMESTAMP,        -- Timestamp server saat sync

    -- Metadata
    device_info JSONB,                  -- Info devicepetugas
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    offline_id VARCHAR(100),            -- ID lokal untuk tracking offline

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_collections_assignment ON collections(assignment_id);
CREATE INDEX idx_collections_can ON collections(can_id);
CREATE INDEX idx_collections_officer ON collections(officer_id);
CREATE INDEX idx_collections_collected ON collections(collected_at);
CREATE INDEX idx_collections_sync ON collections(sync_status);
CREATE INDEX idx_collections_offline_id ON collections(offline_id);

-- ============================================
-- TABLES: Notifications (WhatsApp Logs)
-- ============================================

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collection_id UUID REFERENCES collections(id),
    recipient_phone VARCHAR(20) NOT NULL,
    recipient_name VARCHAR(100),
    message_template VARCHAR(50),  -- Template yang digunakan
    message_content TEXT NOT NULL,  -- Isi pesan yang dikirim
    status VARCHAR(20) DEFAULT 'PENDING',  -- PENDING, SENT, FAILED
    sent_at TIMESTAMP,
    error_message TEXT,
    wa_message_id VARCHAR(100),   -- ID pesan dari WhatsApp API

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_collection ON notifications(collection_id);
CREATE INDEX idx_notifications_phone ON notifications(recipient_phone);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_sent ON notifications(sent_at);

-- ============================================
-- TABLES: Activity Logs (Audit Trail)
-- ============================================

CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    officer_id UUID,
    action_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_user ON activity_logs(user_id);
CREATE INDEX idx_activity_officer ON activity_logs(officer_id);
CREATE INDEX idx_activity_type ON activity_logs(action_type);
CREATE INDEX idx_activity_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX idx_activity_created ON activity_logs(created_at);

-- ============================================
-- TABLES: Sync Queue (for offline support)
-- ============================================

CREATE TABLE sync_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    officer_id UUID NOT NULL REFERENCES officers(id),
    entity_type VARCHAR(50) NOT NULL,
    entity_data JSONB NOT NULL,
    local_id VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

CREATE INDEX idx_sync_queue_officer ON sync_queue(officer_id);
CREATE INDEX idx_sync_queue_status ON sync_queue(status);
CREATE INDEX idx_sync_queue_local ON sync_queue(local_id);

-- ============================================
-- TABLES: Reports Summary (Materialized for performance)
-- ============================================

CREATE TABLE collection_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL,
    district_id UUID REFERENCES districts(id),
    branch_id UUID REFERENCES branches(id),
    officer_id UUID REFERENCES officers(id),

    -- Summary data
    total_amount DECIMAL(15, 2) DEFAULT 0,
    collection_count INTEGER DEFAULT 0,
    cash_count INTEGER DEFAULT 0,
    cash_amount DECIMAL(15, 2) DEFAULT 0,
    transfer_count INTEGER DEFAULT 0,
    transfer_amount DECIMAL(15, 2) DEFAULT 0,

    -- Calculated at
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(period_year, period_month, district_id, branch_id, officer_id)
);

CREATE INDEX idx_summary_period ON collection_summaries(period_year, period_month);
CREATE INDEX idx_summary_district ON collection_summaries(district_id);
CREATE INDEX idx_summary_branch ON collection_summaries(branch_id);
CREATE INDEX idx_summary_officer ON collection_summaries(officer_id);

-- ============================================
-- TRIGGERS: Auto-update timestamps
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER trg_districts_updated_at
    BEFORE UPDATE ON districts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_branches_updated_at
    BEFORE UPDATE ON branches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_officers_updated_at
    BEFORE UPDATE ON officers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_cans_updated_at
    BEFORE UPDATE ON cans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_assignments_updated_at
    BEFORE UPDATE ON assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_collections_updated_at
    BEFORE UPDATE ON collections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- VIEWS: Common queries
-- ============================================

-- View untuk laporan per periode
CREATE OR REPLACE VIEW v_collection_report AS
SELECT
    c.id,
    c.collected_at,
    c.amount,
    c.payment_method,
    c.sync_status,
    o.full_name AS officer_name,
    o.employee_code,
    b.name AS branch_name,
    d.name AS district_name,
    can.owner_name,
    can.qr_code
FROM collections c
JOIN officers o ON c.officer_id = o.id
JOIN branches b ON o.branch_id = b.id
JOIN districts d ON o.district_id = d.id
JOIN cans can ON c.can_id = can.id;

-- View untuk statistik can
CREATE OR REPLACE VIEW v_can_statistics AS
SELECT
    can.id,
    can.qr_code,
    can.owner_name,
    can.branch_id,
    COUNT(c.id) AS total_collections,
    COALESCE(SUM(c.amount), 0) AS total_amount,
    MAX(c.collected_at) AS last_collected
FROM cans
LEFT JOIN collections c ON can.id = c.can_id AND c.sync_status = 'COMPLETED'
GROUP BY can.id, can.qr_code, can.owner_name, can.branch_id;

-- View untuk statistik petugas
CREATE OR REPLACE VIEW v_officer_statistics AS
SELECT
    o.id,
    o.full_name,
    o.employee_code,
    o.branch_id,
    COUNT(DISTINCT a.id) AS assigned_cans,
    COUNT(DISTINCT c.id) AS completed_collections,
    COALESCE(SUM(c.amount), 0) AS total_collected
FROM officers o
LEFT JOIN assignments a ON o.id = a.officer_id AND a.status = 'ACTIVE'
LEFT JOIN collections c ON o.id = c.officer_id AND c.sync_status = 'COMPLETED'
GROUP BY o.id, o.full_name, o.employee_code, o.branch_id;

-- ============================================
-- SEED DATA: Initial setup
-- ============================================

-- Insert sample district
INSERT INTO districts (code, name, region_code) VALUES
('KEC001', 'Kecamatan Contoh', 'KC01');

-- Insert sample branch
INSERT INTO branches (district_id, code, name) VALUES
((SELECT id FROM districts WHERE code = 'KEC001'), 'RANT001', 'Ranting Contoh');

-- ============================================
-- END OF SCHEMA
-- ============================================