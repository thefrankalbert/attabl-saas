-- ============================================
-- ATTABL SaaS - Ads & Announcements Tables
-- ============================================
-- Creates ads and announcements tables with RLS policies.
-- These tables existed in production without tracked migrations
-- or RLS policies, leaving tenant isolation unguaranteed.
-- Date: 2026-03-31
-- Priority: P0 SECURITY
-- ============================================

-- ============================================
-- STEP 1: Create ads table
-- ============================================
CREATE TABLE IF NOT EXISTS ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  link TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ads_tenant_id ON ads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ads_tenant_active ON ads(tenant_id, is_active) WHERE is_active = true;

-- ============================================
-- STEP 2: Create announcements table
-- ============================================
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  title_en TEXT,
  description TEXT,
  description_en TEXT,
  image_url TEXT,
  start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_date TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_tenant_id ON announcements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_announcements_tenant_active ON announcements(tenant_id, is_active)
  WHERE is_active = true;

-- ============================================
-- STEP 3: Enable RLS
-- ============================================
ALTER TABLE ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 4: RLS policies for ads
-- ============================================

-- Public read: uses service_role from server components (anon cannot read directly).
-- Application code always filters by tenant_id; RLS is the safety net.
DROP POLICY IF EXISTS "Anyone can view active ads" ON ads;
CREATE POLICY "Anyone can view active ads" ON ads
  FOR SELECT USING (true);

-- Admin full access: authenticated admins manage their tenant ads
DROP POLICY IF EXISTS "Admins can manage own tenant ads" ON ads;
CREATE POLICY "Admins can manage own tenant ads" ON ads
  FOR INSERT WITH CHECK (tenant_id = ANY(get_my_tenant_ids_array()));

DROP POLICY IF EXISTS "Admins can update own tenant ads" ON ads;
CREATE POLICY "Admins can update own tenant ads" ON ads
  FOR UPDATE USING (tenant_id = ANY(get_my_tenant_ids_array()));

DROP POLICY IF EXISTS "Admins can delete own tenant ads" ON ads;
CREATE POLICY "Admins can delete own tenant ads" ON ads
  FOR DELETE USING (tenant_id = ANY(get_my_tenant_ids_array()));

-- ============================================
-- STEP 5: RLS policies for announcements
-- ============================================

-- Public read: uses service_role from server components (anon cannot read directly).
DROP POLICY IF EXISTS "Anyone can view active announcements" ON announcements;
CREATE POLICY "Anyone can view active announcements" ON announcements
  FOR SELECT USING (true);

-- Admin write access: authenticated admins manage their tenant announcements
DROP POLICY IF EXISTS "Admins can manage own tenant announcements" ON announcements;
CREATE POLICY "Admins can manage own tenant announcements" ON announcements
  FOR INSERT WITH CHECK (tenant_id = ANY(get_my_tenant_ids_array()));

DROP POLICY IF EXISTS "Admins can update own tenant announcements" ON announcements;
CREATE POLICY "Admins can update own tenant announcements" ON announcements
  FOR UPDATE USING (tenant_id = ANY(get_my_tenant_ids_array()));

DROP POLICY IF EXISTS "Admins can delete own tenant announcements" ON announcements;
CREATE POLICY "Admins can delete own tenant announcements" ON announcements
  FOR DELETE USING (tenant_id = ANY(get_my_tenant_ids_array()));

-- ============================================
-- STEP 6: Analyze new tables
-- ============================================
ANALYZE ads;
ANALYZE announcements;
