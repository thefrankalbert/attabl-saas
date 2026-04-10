-- Fix remaining Supabase linter warnings (2026-04-03)

-- 1. Fix set_trial_end_date search_path (function_search_path_mutable)
ALTER FUNCTION public.set_trial_end_date() SET search_path = public;

-- 2. Tighten 'Anyone can create orders' RLS policy (rls_policy_always_true)
-- QR ordering requires anonymous INSERT, but we now validate that tenant_id
-- references an active tenant instead of allowing unrestricted inserts.
DROP POLICY IF EXISTS "Anyone can create orders" ON orders;
CREATE POLICY "Anyone can create orders" ON orders
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM tenants WHERE id = tenant_id AND is_active = true)
  );

-- 3. Tighten 'Anyone can create order items' RLS policy (rls_policy_always_true)
-- Require order_id to reference an existing order (prevents orphaned items).
DROP POLICY IF EXISTS "Anyone can create order items" ON order_items;
CREATE POLICY "Anyone can create order items" ON order_items
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM orders WHERE id = order_id)
  );

-- 4. Replace 'Service can insert notifications' with tenant-scoped policy (rls_policy_always_true)
-- The service_role key bypasses RLS anyway. This policy now restricts anon/authenticated
-- inserts to the user's own tenant.
DROP POLICY IF EXISTS "Service can insert notifications" ON notifications;
CREATE POLICY "Admins can insert notifications" ON notifications
  FOR INSERT
  WITH CHECK (
    tenant_id = ANY(get_my_tenant_ids_array())
  );
