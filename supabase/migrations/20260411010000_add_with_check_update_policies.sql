-- ============================================================================
-- Add WITH CHECK to 9 UPDATE policies that were missing it
-- ----------------------------------------------------------------------------
-- Per CLAUDE.md "Regles de securite > Base de donnees" rule:
--   "Ajouter WITH CHECK sur toutes les policies UPDATE et INSERT"
--
-- Without WITH CHECK, an authenticated user passing the USING clause could
-- modify a row to a state that violates the same condition (e.g. change
-- tenant_id to a tenant they don't belong to). The WITH CHECK enforces that
-- the new row state ALSO satisfies the policy.
--
-- This migration mirrors the USING clause into WITH CHECK for each affected
-- policy. We DROP and CREATE rather than ALTER POLICY because PostgreSQL only
-- supports adding WITH CHECK via DROP/CREATE on some versions.
-- ============================================================================

-- 1. ingredients
DROP POLICY IF EXISTS "ingredients_update" ON ingredients;
CREATE POLICY "ingredients_update" ON ingredients
  FOR UPDATE
  USING (tenant_id IN (SELECT au.tenant_id FROM admin_users au WHERE au.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT au.tenant_id FROM admin_users au WHERE au.user_id = auth.uid()));

-- 2. item_suggestions
DROP POLICY IF EXISTS "item_suggestions_update" ON item_suggestions;
CREATE POLICY "item_suggestions_update" ON item_suggestions
  FOR UPDATE
  USING (tenant_id IN (SELECT au.tenant_id FROM admin_users au WHERE au.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT au.tenant_id FROM admin_users au WHERE au.user_id = auth.uid()));

-- 3. onboarding_progress
DROP POLICY IF EXISTS "Users can update own onboarding_progress" ON onboarding_progress;
CREATE POLICY "Users can update own onboarding_progress" ON onboarding_progress
  FOR UPDATE
  USING (tenant_id IN (SELECT admin_users.tenant_id FROM admin_users WHERE admin_users.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT admin_users.tenant_id FROM admin_users WHERE admin_users.user_id = auth.uid()));

-- 4. order_items (validates that the order being modified still belongs to the admin's tenant)
DROP POLICY IF EXISTS "Admins can update own tenant order items" ON order_items;
CREATE POLICY "Admins can update own tenant order items" ON order_items
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.tenant_id = ANY(get_my_tenant_ids_array())))
  WITH CHECK (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.tenant_id = ANY(get_my_tenant_ids_array())));

-- 5. orders (prevents transferring an order to a different tenant)
DROP POLICY IF EXISTS "Admins can manage their restaurant orders" ON orders;
CREATE POLICY "Admins can manage their restaurant orders" ON orders
  FOR UPDATE
  USING (tenant_id = ANY(get_my_tenant_ids_array()))
  WITH CHECK (tenant_id = ANY(get_my_tenant_ids_array()));

-- 6. recipes
DROP POLICY IF EXISTS "recipes_update" ON recipes;
CREATE POLICY "recipes_update" ON recipes
  FOR UPDATE
  USING (tenant_id IN (SELECT au.tenant_id FROM admin_users au WHERE au.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT au.tenant_id FROM admin_users au WHERE au.user_id = auth.uid()));

-- 7. suppliers
DROP POLICY IF EXISTS "suppliers_update" ON suppliers;
CREATE POLICY "suppliers_update" ON suppliers
  FOR UPDATE
  USING (tenant_id IN (SELECT au.tenant_id FROM admin_users au WHERE au.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT au.tenant_id FROM admin_users au WHERE au.user_id = auth.uid()));

-- 8. tenants (prevents an admin from changing the tenant id to escalate privilege)
DROP POLICY IF EXISTS "Admins can update own tenant" ON tenants;
CREATE POLICY "Admins can update own tenant" ON tenants
  FOR UPDATE
  USING (id = ANY(get_my_tenant_ids_array()))
  WITH CHECK (id = ANY(get_my_tenant_ids_array()));

-- 9. user_preferences
DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
CREATE POLICY "Users can update own preferences" ON user_preferences
  FOR UPDATE
  USING (user_id IN (SELECT admin_users.id FROM admin_users WHERE admin_users.user_id = auth.uid()))
  WITH CHECK (user_id IN (SELECT admin_users.id FROM admin_users WHERE admin_users.user_id = auth.uid()));
