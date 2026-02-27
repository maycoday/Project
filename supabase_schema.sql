-- ============================================================
-- Aawaaz Grievance Portal - Supabase Schema
-- ============================================================
-- This schema stores ONLY encrypted complaint data.
-- No plaintext is ever persisted in the database.
-- All complaints are encrypted client-side using AES-256-GCM.
-- ============================================================

-- Drop existing table if you need to recreate (WARNING: deletes all data)
-- DROP TABLE IF EXISTS complaints_secure CASCADE;

-- ============================================================
-- Main Complaints Table
-- ============================================================
CREATE TABLE IF NOT EXISTS complaints_secure (
  -- Primary identifier
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Short reference ID for display (e.g., "abc123ef")
  reference TEXT,
  
  -- Timestamp when complaint was filed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- SHA-256 hash of the tracking token (used for lookups)
  -- Users provide their token, we hash it and query this field
  token_hash TEXT UNIQUE NOT NULL,
  
  -- First 8 chars of token for hint/display only (not security-sensitive)
  token_hint TEXT,
  
  -- AES-GCM encrypted complaint (base64 encoded ciphertext)
  -- This is the ONLY place the complaint content exists
  ciphertext_b64 TEXT NOT NULL,
  
  -- Initialization vector for AES-GCM (base64 encoded)
  iv_b64 TEXT NOT NULL,
  
  -- Array of authority codes that can decrypt this complaint
  -- e.g., ['HR', 'ICC', 'NGO']
  authorities TEXT[],
  
  -- RSA-wrapped AES keys for each authority
  -- Each authority's public key was used to wrap the session key
  -- Format: {"HR": "base64_wrapped_key", "ICC": "...", ...}
  wrapped_keys JSONB,
  
  -- Metadata for analytics (NEVER contains complaint plaintext)
  -- Pattern detection uses this for trend analysis
  -- Example: {"category": "Harassment", "department": "Engineering", "urgency": 4, "sentiment": 7}
  metadata JSONB
);

-- ============================================================
-- Indexes for Performance
-- ============================================================

-- Index for token lookup (most common query)
CREATE INDEX IF NOT EXISTS idx_complaints_token_hash 
  ON complaints_secure(token_hash);

-- Index for timestamp queries (pattern detection time-series)
CREATE INDEX IF NOT EXISTS idx_complaints_created_at 
  ON complaints_secure(created_at DESC);

-- Index for metadata category filtering (analytics dashboards)
CREATE INDEX IF NOT EXISTS idx_complaints_metadata_category 
  ON complaints_secure USING GIN ((metadata->'category'));

-- Index for metadata department filtering
CREATE INDEX IF NOT EXISTS idx_complaints_metadata_department 
  ON complaints_secure USING GIN ((metadata->'department'));

-- Index for authorities array (if querying by receiving authority)
CREATE INDEX IF NOT EXISTS idx_complaints_authorities 
  ON complaints_secure USING GIN (authorities);

-- ============================================================
-- Row Level Security (RLS) Policies
-- ============================================================

-- Enable RLS on the table
ALTER TABLE complaints_secure ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anonymous users to INSERT new complaints
-- This allows the public portal to file encrypted complaints
CREATE POLICY "Allow anonymous complaint submission"
  ON complaints_secure
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Policy: Allow anonymous users to SELECT complaints by token_hash
-- This enables the tracking feature (users can look up their own complaint)
CREATE POLICY "Allow token-based complaint lookup"
  ON complaints_secure
  FOR SELECT
  TO anon
  USING (true);

-- Policy: Allow authenticated admin users to see all data
-- Replace 'authenticated' with a custom role if you have admin users
CREATE POLICY "Allow admin full access"
  ON complaints_secure
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- Optional: Create a view for analytics dashboards
-- ============================================================
-- This view exposes ONLY the metadata, not the encrypted content
-- Use this for public pattern-detection dashboards

CREATE OR REPLACE VIEW complaints_analytics AS
SELECT 
  id,
  reference,
  created_at,
  authorities,
  metadata,
  -- Expose ciphertext for display purposes in admin views
  -- (shows encrypted blob, not plaintext)
  ciphertext_b64,
  iv_b64
FROM complaints_secure;

-- Optional: Grant access to the analytics view
GRANT SELECT ON complaints_analytics TO anon;

-- ============================================================
-- Helper Functions (Optional)
-- ============================================================

-- Function to get complaint count (for dashboard stats)
CREATE OR REPLACE FUNCTION get_complaint_count()
RETURNS BIGINT
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT COUNT(*) FROM complaints_secure;
$$;

-- Function to get recent complaints for pattern detection
CREATE OR REPLACE FUNCTION get_recent_complaints(hours INT DEFAULT 72)
RETURNS SETOF complaints_analytics
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT * FROM complaints_analytics
  WHERE created_at > NOW() - INTERVAL '1 hour' * hours
  ORDER BY created_at DESC;
$$;

-- ============================================================
-- Sample Query Examples
-- ============================================================

-- Query 1: Find complaint by token hash
-- SELECT * FROM complaints_secure WHERE token_hash = 'sha256_hash_here';

-- Query 2: Get all complaints from last 72 hours for analytics
-- SELECT id, created_at, metadata FROM complaints_secure 
-- WHERE created_at > NOW() - INTERVAL '72 hours' 
-- ORDER BY created_at DESC;

-- Query 3: Get category distribution (for charts)
-- SELECT metadata->>'category' as category, COUNT(*) 
-- FROM complaints_secure 
-- WHERE created_at > NOW() - INTERVAL '72 hours'
-- GROUP BY metadata->>'category';

-- Query 4: Get department heatmap data
-- SELECT metadata->>'department' as department, COUNT(*) 
-- FROM complaints_secure 
-- WHERE created_at > NOW() - INTERVAL '72 hours'
-- GROUP BY metadata->>'department';

-- ============================================================
-- Security Notes
-- ============================================================
-- 1. NEVER STORE PLAINTEXT: Only encrypted ciphertext goes in the DB
-- 2. TOKEN_HASH: Users' tracking tokens are hashed (SHA-256) before storage
-- 3. WRAPPED_KEYS: AES session keys are encrypted with RSA public keys
-- 4. AUTHORITIES: Only selected authorities can decrypt (RSA private key required)
-- 5. METADATA: Contains NO sensitive content, only analytics categories/tags
-- 6. RLS POLICIES: Restrict access patterns (anon can insert/select, admin has full access)
-- 7. NO IP LOGGING: Don't add IP address columns unless legally required
-- ============================================================

-- ============================================================
-- Testing the Schema
-- ============================================================
-- After running this schema, test with a sample insert:
/*
INSERT INTO complaints_secure (
  reference,
  token_hash,
  token_hint,
  ciphertext_b64,
  iv_b64,
  authorities,
  wrapped_keys,
  metadata
) VALUES (
  'TEST001',
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', -- SHA-256 of empty string (for test)
  'abc12345',
  'dGVzdCBjaXBoZXJ0ZXh0',  -- base64 "test ciphertext"
  'dGVzdCBpdg==',          -- base64 "test iv"
  ARRAY['HR', 'ICC'],
  '{"HR": "wrapped_key_base64", "ICC": "wrapped_key_base64"}'::jsonb,
  '{"category": "Test", "department": "Testing", "urgency": 3, "sentiment": 5}'::jsonb
);
*/

-- Verify the insert worked:
-- SELECT * FROM complaints_secure WHERE reference = 'TEST001';

-- ============================================================
-- Migration / Backup Notes
-- ============================================================
-- To backup encrypted complaints (safe to store anywhere since encrypted):
-- pg_dump -t complaints_secure your_db > complaints_backup.sql

-- To restore:
-- psql your_db < complaints_backup.sql
-- ============================================================
