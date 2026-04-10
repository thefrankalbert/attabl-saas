-- ============================================
-- ATTABL SaaS - RLS Security Migration
-- ============================================
-- Fix: Enable Row Level Security on all tables
-- Author: Security Audit
-- Date: 2026-02-07
-- Priority: P0 CRITICAL
-- ============================================

-- ============================================
-- STEP 1: Enable RLS on all multi-tenant tables
-- ============================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 2: Policies for TENANTS table
-- ============================================
-- Tenants can only be viewed by their admins
-- Public can view active tenants by slug (for menu pages)

DROP POLICY IF EXISTS "Public can view active tenants by slug" ON tenants;
CREATE POLICY "Public can view active tenants by slug" ON tenants
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins can update own tenant" ON tenants;
CREATE POLICY "Admins can update own tenant" ON tenants
  FOR UPDATE USING (id IN (SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()));

-- ============================================
-- STEP 3: Policies for ADMIN_USERS table
-- ============================================

DROP POLICY IF EXISTS "Admins can view own tenant admins" ON admin_users;
CREATE POLICY "Admins can view own tenant admins" ON admin_users
  FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins can manage own tenant admins" ON admin_users;
CREATE POLICY "Admins can manage own tenant admins" ON admin_users
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM admin_users WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

-- Allow users to see their own admin_users record
DROP POLICY IF EXISTS "Users can view own record" ON admin_users;
CREATE POLICY "Users can view own record" ON admin_users
  FOR SELECT USING (user_id = auth.uid());

-- ============================================
-- STEP 4: Policies for ORDERS table
-- ============================================

DROP POLICY IF EXISTS "Admins can view own tenant orders" ON orders;
CREATE POLICY "Admins can view own tenant orders" ON orders
  FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins can manage own tenant orders" ON orders;
CREATE POLICY "Admins can manage own tenant orders" ON orders
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()));

-- Public can create orders (for customers placing orders)
DROP POLICY IF EXISTS "Public can create orders" ON orders;
CREATE POLICY "Public can create orders" ON orders
  FOR INSERT WITH CHECK (true);

-- ============================================
-- STEP 5: Policies for MENU_ITEMS table
-- ============================================

DROP POLICY IF EXISTS "Public can view available menu items" ON menu_items;
CREATE POLICY "Public can view available menu items" ON menu_items
  FOR SELECT USING (is_available = true);

DROP POLICY IF EXISTS "Admins can manage own tenant menu items" ON menu_items;
CREATE POLICY "Admins can manage own tenant menu items" ON menu_items
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()));

-- ============================================
-- STEP 6: Policies for CATEGORIES table
-- ============================================

DROP POLICY IF EXISTS "Public can view active categories" ON categories;
CREATE POLICY "Public can view active categories" ON categories
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage own tenant categories" ON categories;
CREATE POLICY "Admins can manage own tenant categories" ON categories
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()));

-- ============================================
-- STEP 7: Policies for VENUES table
-- ============================================

DROP POLICY IF EXISTS "Public can view active venues" ON venues;
CREATE POLICY "Public can view active venues" ON venues
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage own tenant venues" ON venues;
CREATE POLICY "Admins can manage own tenant venues" ON venues
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()));

-- ============================================
-- DONE! RLS now active on all tables.
-- ============================================
