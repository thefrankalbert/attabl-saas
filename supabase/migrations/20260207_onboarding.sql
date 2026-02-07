-- Onboarding System Schema Updates
-- Run this migration to add onboarding support

-- Add new columns to tenants table for onboarding data
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS establishment_type VARCHAR(50) DEFAULT 'restaurant';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'Tchad';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS table_count INTEGER DEFAULT 10;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7) DEFAULT '#000000';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP;

-- Create onboarding_progress table to track wizard state
CREATE TABLE IF NOT EXISTS onboarding_progress (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  step INTEGER DEFAULT 1 CHECK (step >= 1 AND step <= 4),
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add RLS policies for onboarding_progress
ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own tenant's onboarding progress
CREATE POLICY "Users can view own onboarding_progress" ON onboarding_progress
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can insert their own tenant's onboarding progress
CREATE POLICY "Users can insert own onboarding_progress" ON onboarding_progress
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can update their own tenant's onboarding progress
CREATE POLICY "Users can update own onboarding_progress" ON onboarding_progress
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()
    )
  );

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_tenant ON onboarding_progress(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_onboarding ON tenants(onboarding_completed);
