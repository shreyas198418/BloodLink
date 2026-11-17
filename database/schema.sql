-- BloodLink PostgreSQL + pgvector Relational Schema Reference
-- Note: Managed in production via Drizzle ORM (src/db/schema.ts) and Cloud SQL UpdateSchema.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS blood_banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL DEFAULT 0,
  longitude DOUBLE PRECISION NOT NULL DEFAULT 0,
  contact_number TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  operating_status TEXT NOT NULL DEFAULT 'Active'
    CHECK (operating_status IN ('Active', 'Limited', 'Closed')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'STAFF'
    CHECK (role IN ('ADMIN', 'STAFF')),
  blood_bank_id UUID REFERENCES blood_banks(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS donors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  blood_group TEXT NOT NULL
    CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  rh_factor TEXT NOT NULL
    CHECK (rh_factor IN ('Positive', 'Negative')),
  phone_number TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL DEFAULT 0,
  longitude DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_donation_date TEXT,
  availability_status TEXT NOT NULL DEFAULT 'Available'
    CHECK (availability_status IN ('Available', 'Unavailable', 'Deferred')),
  associated_bank_id UUID REFERENCES blood_banks(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  registered_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blood_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blood_bank_id UUID NOT NULL REFERENCES blood_banks(id) ON DELETE CASCADE,
  blood_group TEXT NOT NULL
    CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  rh_factor TEXT NOT NULL,
  units_available INTEGER NOT NULL CHECK (units_available >= 0),
  minimum_threshold INTEGER NOT NULL DEFAULT 5 CHECK (minimum_threshold >= 0),
  collection_date TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
  inventory_status TEXT NOT NULL DEFAULT 'Available'
    CHECK (inventory_status IN ('Available', 'Low Stock', 'Expired', 'Depleted')),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blood_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_code TEXT NOT NULL UNIQUE,
  hospital_name TEXT NOT NULL,
  hospital_location TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL DEFAULT 0,
  longitude DOUBLE PRECISION NOT NULL DEFAULT 0,
  contact_person TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  required_blood_group TEXT NOT NULL
    CHECK (required_blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  rh_factor TEXT NOT NULL,
  units_required INTEGER NOT NULL CHECK (units_required > 0),
  units_fulfilled INTEGER NOT NULL DEFAULT 0 CHECK (units_fulfilled >= 0),
  priority TEXT NOT NULL DEFAULT 'Routine'
    CHECK (priority IN ('Emergency', 'Urgent', 'Routine')),
  priority_score DOUBLE PRECISION NOT NULL DEFAULT 20,
  request_description TEXT NOT NULL,
  medical_urgency_notes TEXT DEFAULT '',
  extracted_context JSONB,
  request_date TIMESTAMP NOT NULL DEFAULT NOW(),
  required_by_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Processing', 'Matched', 'Partially Fulfilled', 'Fulfilled', 'Rejected', 'Cancelled')),
  assigned_bank_id UUID REFERENCES blood_banks(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS donor_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
  donor_id UUID REFERENCES donors(id) ON DELETE SET NULL,
  blood_bank_id UUID REFERENCES blood_banks(id) ON DELETE SET NULL,
  match_type TEXT NOT NULL CHECK (match_type IN ('DONOR', 'BLOOD_BANK')),
  match_score DOUBLE PRECISION NOT NULL,
  distance_km DOUBLE PRECISION,
  explanation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Suggested'
    CHECK (status IN ('Suggested', 'Confirmed', 'Allocated', 'Declined')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS request_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  previous_priority TEXT,
  new_priority TEXT,
  changed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT DEFAULT '',
  changed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL REFERENCES blood_inventory(id) ON DELETE CASCADE,
  blood_bank_id UUID NOT NULL REFERENCES blood_banks(id) ON DELETE CASCADE,
  request_id UUID REFERENCES blood_requests(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL
    CHECK (transaction_type IN ('ADD', 'RESTOCK', 'ALLOCATE', 'ADJUST', 'EXPIRE')),
  units_delta INTEGER NOT NULL,
  units_after INTEGER NOT NULL,
  performed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blood_bank_id UUID REFERENCES blood_banks(id) ON DELETE SET NULL,
  severity TEXT NOT NULL DEFAULT 'Info' CHECK (severity IN ('Critical', 'Warning', 'Info')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS request_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES blood_requests(id) ON DELETE CASCADE,
  embedding_model TEXT NOT NULL DEFAULT 'bloodlink-semantic-v1-128d',
  embedding VECTOR(128) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_blood_group ON blood_inventory (blood_group);
CREATE INDEX IF NOT EXISTS idx_inventory_bank ON blood_inventory (blood_bank_id);
CREATE INDEX IF NOT EXISTS idx_inventory_expiry ON blood_inventory (expiry_date);
CREATE INDEX IF NOT EXISTS idx_requests_priority ON blood_requests (priority, priority_score);
CREATE INDEX IF NOT EXISTS idx_requests_status ON blood_requests (status);
CREATE INDEX IF NOT EXISTS idx_requests_blood_group ON blood_requests (required_blood_group);
CREATE INDEX IF NOT EXISTS idx_donors_blood_group ON donors (blood_group);
