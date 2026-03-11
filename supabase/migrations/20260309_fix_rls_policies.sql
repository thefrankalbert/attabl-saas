-- ============================================================================
-- Fix critical RLS policy vulnerabilities
-- Date: 2026-03-09
-- ============================================================================

-- 1. Fix `orders` INSERT policy
-- Previously: WITH CHECK (true) — anyone could insert orders for any tenant
-- Now: orders can only be inserted if the tenant exists and is active
DROP POLICY IF EXISTS "Public can create orders" ON orders;

CREATE POLICY "Orders require active tenant" ON orders
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenants WHERE tenants.id = orders.tenant_id AND tenants.is_active = true
    )
  );

-- 2. Fix `notifications` INSERT policy
-- Previously: WITH CHECK (true) — any anonymous user could insert notifications
-- Now: only service_role can insert notifications
DROP POLICY IF EXISTS "Service can insert notifications" ON notifications;

CREATE POLICY "Only service role can insert notifications" ON notifications
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- 3. Fix `push_subscriptions` SELECT policy
-- Previously: USING (true) — any anonymous user could read all push subscriptions
-- Now: only service_role can read push subscriptions
DROP POLICY IF EXISTS "Service can read all push subscriptions" ON push_subscriptions;

CREATE POLICY "Only service role can read push subscriptions" ON push_subscriptions
  FOR SELECT USING (auth.role() = 'service_role');
