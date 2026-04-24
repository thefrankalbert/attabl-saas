-- Remove overly permissive INSERT policies on orders and order_items (HIGH-06 + MED-05/06)
-- All order creation MUST go through the Next.js API which validates prices server-side.
-- Allowing direct SDK inserts from anon clients bypasses server-side price validation.

DROP POLICY IF EXISTS "Anyone can create orders" ON orders;
DROP POLICY IF EXISTS "Anyone can create order items" ON order_items;

-- Replace with service_role-only insert (Next.js API uses service_role for order creation)
-- Public clients cannot insert orders directly via Supabase SDK.
-- The existing SELECT policies remain intact:
--   - "Public can view their orders by table" (or equivalent anon SELECT)
--   - "Admins can view own tenant orders"
-- The existing admin ALL policies also remain intact and continue to allow
-- service_role/authenticated admin access.
