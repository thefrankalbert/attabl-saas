-- ============================================
-- ATTABL SaaS - RLS Performance Optimization
-- ============================================
-- Optimization: Replace IN (SELECT get_my_tenant_ids()) with = ANY(get_my_tenant_ids_array())
-- The array-based approach avoids repeated subquery execution in RLS policy checks.
-- Also drops unused index idx_menu_items_featured.
-- Author: Performance Optimization
-- Date: 2026-02-27
-- Priority: P2 PERFORMANCE
-- ============================================

-- ============================================
-- STEP 1: Create optimized helper function (returns uuid[] instead of SETOF uuid)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_my_tenant_ids_array()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(tenant_id), '{}')
  FROM admin_users
  WHERE user_id = auth.uid()
$$;

-- ============================================
-- STEP 2: Drop unused index
-- ============================================
DROP INDEX IF EXISTS idx_menu_items_featured;

-- ============================================
-- STEP 3: Migrate admin_users policies
-- ============================================
DROP POLICY IF EXISTS "Admins can view own tenant admins" ON admin_users;
CREATE POLICY "Admins can view own tenant admins" ON admin_users
  FOR SELECT USING (
    user_id = auth.uid()
    OR tenant_id = ANY(get_my_tenant_ids_array())
  );

DROP POLICY IF EXISTS "Admins can manage own tenant admins" ON admin_users;
CREATE POLICY "Admins can manage own tenant admins" ON admin_users
  FOR ALL USING (
    tenant_id = ANY(get_my_tenant_ids_array())
  );

-- ============================================
-- STEP 4: Migrate orders policies
-- ============================================
DROP POLICY IF EXISTS "Admins can view own tenant orders" ON orders;
CREATE POLICY "Admins can view own tenant orders" ON orders
  FOR SELECT USING (tenant_id = ANY(get_my_tenant_ids_array()));

DROP POLICY IF EXISTS "Admins can manage own tenant orders" ON orders;
CREATE POLICY "Admins can manage own tenant orders" ON orders
  FOR ALL USING (tenant_id = ANY(get_my_tenant_ids_array()));

-- ============================================
-- STEP 5: Migrate menu_items policies
-- ============================================
DROP POLICY IF EXISTS "Admins can manage own tenant menu items" ON menu_items;
CREATE POLICY "Admins can manage own tenant menu items" ON menu_items
  FOR ALL USING (tenant_id = ANY(get_my_tenant_ids_array()));

-- ============================================
-- STEP 6: Migrate categories policies
-- ============================================
DROP POLICY IF EXISTS "Admins can manage own tenant categories" ON categories;
CREATE POLICY "Admins can manage own tenant categories" ON categories
  FOR ALL USING (tenant_id = ANY(get_my_tenant_ids_array()));

-- ============================================
-- STEP 7: Migrate venues policies
-- ============================================
DROP POLICY IF EXISTS "Admins can manage own tenant venues" ON venues;
CREATE POLICY "Admins can manage own tenant venues" ON venues
  FOR ALL USING (tenant_id = ANY(get_my_tenant_ids_array()));

-- ============================================
-- STEP 8: Migrate tenants policy
-- ============================================
DROP POLICY IF EXISTS "Admins can update own tenant" ON tenants;
CREATE POLICY "Admins can update own tenant" ON tenants
  FOR UPDATE USING (id = ANY(get_my_tenant_ids_array()));

-- ============================================
-- STEP 9: Migrate menus policy
-- ============================================
DROP POLICY IF EXISTS "Admins can manage own tenant menus" ON menus;
CREATE POLICY "Admins can manage own tenant menus" ON menus
  FOR ALL USING (tenant_id = ANY(get_my_tenant_ids_array()));

-- ============================================
-- STEP 10: Migrate ingredients policies
-- ============================================
DROP POLICY IF EXISTS "Admins can manage own tenant ingredients" ON ingredients;
CREATE POLICY "Admins can manage own tenant ingredients" ON ingredients
  FOR ALL USING (tenant_id = ANY(get_my_tenant_ids_array()));

DROP POLICY IF EXISTS "Admins can view own tenant ingredients" ON ingredients;
CREATE POLICY "Admins can view own tenant ingredients" ON ingredients
  FOR SELECT USING (tenant_id = ANY(get_my_tenant_ids_array()));

-- ============================================
-- STEP 11: Migrate recipes policies
-- ============================================
DROP POLICY IF EXISTS "Admins can manage own tenant recipes" ON recipes;
CREATE POLICY "Admins can manage own tenant recipes" ON recipes
  FOR ALL USING (tenant_id = ANY(get_my_tenant_ids_array()));

DROP POLICY IF EXISTS "Admins can view own tenant recipes" ON recipes;
CREATE POLICY "Admins can view own tenant recipes" ON recipes
  FOR SELECT USING (tenant_id = ANY(get_my_tenant_ids_array()));

-- ============================================
-- STEP 12: Migrate stock_movements policies
-- ============================================
DROP POLICY IF EXISTS "Admins can manage own tenant stock_movements" ON stock_movements;
CREATE POLICY "Admins can manage own tenant stock_movements" ON stock_movements
  FOR ALL USING (tenant_id = ANY(get_my_tenant_ids_array()));

DROP POLICY IF EXISTS "Admins can view own tenant stock_movements" ON stock_movements;
CREATE POLICY "Admins can view own tenant stock_movements" ON stock_movements
  FOR SELECT USING (tenant_id = ANY(get_my_tenant_ids_array()));

-- ============================================
-- STEP 13: Migrate suppliers policies
-- ============================================
DROP POLICY IF EXISTS "Admins can manage own tenant suppliers" ON suppliers;
CREATE POLICY "Admins can manage own tenant suppliers" ON suppliers
  FOR ALL USING (tenant_id = ANY(get_my_tenant_ids_array()));

DROP POLICY IF EXISTS "Admins can view own tenant suppliers" ON suppliers;
CREATE POLICY "Admins can view own tenant suppliers" ON suppliers
  FOR SELECT USING (tenant_id = ANY(get_my_tenant_ids_array()));

-- ============================================
-- STEP 14: Migrate item_suggestions policies
-- ============================================
DROP POLICY IF EXISTS "Admins can manage own tenant item_suggestions" ON item_suggestions;
CREATE POLICY "Admins can manage own tenant item_suggestions" ON item_suggestions
  FOR ALL USING (tenant_id = ANY(get_my_tenant_ids_array()));

DROP POLICY IF EXISTS "Admins can view own tenant item_suggestions" ON item_suggestions;
CREATE POLICY "Admins can view own tenant item_suggestions" ON item_suggestions
  FOR SELECT USING (tenant_id = ANY(get_my_tenant_ids_array()));

-- ============================================
-- STEP 15: Migrate order_items policies (via join to orders)
-- ============================================
DROP POLICY IF EXISTS "Admins can view own tenant order items" ON order_items;
CREATE POLICY "Admins can view own tenant order items" ON order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
      AND o.tenant_id = ANY(get_my_tenant_ids_array())
    )
  );

DROP POLICY IF EXISTS "Admins can insert own tenant order items" ON order_items;
CREATE POLICY "Admins can insert own tenant order items" ON order_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
      AND o.tenant_id = ANY(get_my_tenant_ids_array())
    )
  );

DROP POLICY IF EXISTS "Admins can update own tenant order items" ON order_items;
CREATE POLICY "Admins can update own tenant order items" ON order_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
      AND o.tenant_id = ANY(get_my_tenant_ids_array())
    )
  );

-- ============================================
-- STEP 16: Migrate coupons policies
-- ============================================
DROP POLICY IF EXISTS "Admins can manage own tenant coupons" ON coupons;
CREATE POLICY "Admins can manage own tenant coupons" ON coupons
  FOR ALL USING (tenant_id = ANY(get_my_tenant_ids_array()));

-- ============================================
-- STEP 17: Run ANALYZE on all affected tables
-- ============================================
ANALYZE admin_users;
ANALYZE orders;
ANALYZE order_items;
ANALYZE menu_items;
ANALYZE categories;
ANALYZE venues;
ANALYZE menus;
ANALYZE ingredients;
ANALYZE recipes;
ANALYZE stock_movements;
ANALYZE suppliers;
ANALYZE item_suggestions;
ANALYZE coupons;
ANALYZE tenants;

-- ============================================
-- DONE! RLS policies optimized with array-based lookup.
-- ============================================
