-- ============================================
-- ATTABL SaaS - Fix RLS Infinite Recursion
-- ============================================
-- Fix: admin_users policies referenced admin_users in sub-queries,
-- causing PostgreSQL "infinite recursion detected in policy" error.
-- Solution: Use a SECURITY DEFINER function to bypass RLS when
-- resolving tenant_ids for the current user.
-- Author: Security Fix
-- Date: 2026-02-09
-- Priority: P0 CRITICAL
-- ============================================

-- ============================================
-- STEP 1: Create helper function (SECURITY DEFINER bypasses RLS)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_my_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()
$$;

-- ============================================
-- STEP 2: Drop ALL old admin_users policies (including legacy ones)
-- ============================================
DROP POLICY IF EXISTS "Admins can view own tenant admins" ON admin_users;
DROP POLICY IF EXISTS "Admins can manage own tenant admins" ON admin_users;
DROP POLICY IF EXISTS "Users can view own record" ON admin_users;
DROP POLICY IF EXISTS "Users can read admins in their tenant" ON admin_users;
DROP POLICY IF EXISTS "Users can read their own admin profile" ON admin_users;

-- ============================================
-- STEP 3: Recreate admin_users policies using helper function
-- ============================================
CREATE POLICY "Admins can view own tenant admins" ON admin_users
  FOR SELECT USING (
    user_id = auth.uid()
    OR tenant_id IN (SELECT get_my_tenant_ids())
  );

CREATE POLICY "Admins can manage own tenant admins" ON admin_users
  FOR ALL USING (
    tenant_id IN (SELECT get_my_tenant_ids())
  );

-- ============================================
-- STEP 4: Update other tables to use helper function
-- ============================================

-- Orders
DROP POLICY IF EXISTS "Admins can view own tenant orders" ON orders;
CREATE POLICY "Admins can view own tenant orders" ON orders
  FOR SELECT USING (tenant_id IN (SELECT get_my_tenant_ids()));

DROP POLICY IF EXISTS "Admins can manage own tenant orders" ON orders;
CREATE POLICY "Admins can manage own tenant orders" ON orders
  FOR ALL USING (tenant_id IN (SELECT get_my_tenant_ids()));

-- Menu items
DROP POLICY IF EXISTS "Admins can manage own tenant menu items" ON menu_items;
CREATE POLICY "Admins can manage own tenant menu items" ON menu_items
  FOR ALL USING (tenant_id IN (SELECT get_my_tenant_ids()));

-- Categories
DROP POLICY IF EXISTS "Admins can manage own tenant categories" ON categories;
CREATE POLICY "Admins can manage own tenant categories" ON categories
  FOR ALL USING (tenant_id IN (SELECT get_my_tenant_ids()));

-- Venues
DROP POLICY IF EXISTS "Admins can manage own tenant venues" ON venues;
CREATE POLICY "Admins can manage own tenant venues" ON venues
  FOR ALL USING (tenant_id IN (SELECT get_my_tenant_ids()));

-- Tenants update policy
DROP POLICY IF EXISTS "Admins can update own tenant" ON tenants;
CREATE POLICY "Admins can update own tenant" ON tenants
  FOR UPDATE USING (id IN (SELECT get_my_tenant_ids()));

-- ============================================
-- DONE! RLS recursion fixed.
-- ============================================
