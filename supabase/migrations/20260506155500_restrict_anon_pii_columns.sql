-- Restrict anon role to non-PII columns on orders and order_items.
--
-- Rationale: the public SELECT policies ("Orders are publicly readable",
-- "Order items are publicly readable") use qual=true and rely on UUID
-- secrecy for customer order tracking (same pattern as Uber Eats). The
-- code comment in src/components/tenant/ClientOrders.tsx previously
-- claimed "no PII", but the orders table contains customer_name,
-- customer_phone, delivery_address, notes and room_number, and
-- order_items contains customer_notes.
--
-- Without this change, an attacker with the public anon key (exposed
-- in every browser) can call GET /rest/v1/orders?select=* and dump all
-- PII across all tenants, because table-level SELECT is granted to anon
-- by Supabase default and the RLS qual is "true".
--
-- Fix: revoke the table-level SELECT and re-grant only the non-PII
-- columns at column level. Legitimate customer tracking flows
-- (ClientOrders, order-confirmed) already only select non-PII columns.
-- Authenticated admins keep full access via the authenticated role.

REVOKE SELECT ON public.orders FROM anon;
REVOKE SELECT ON public.order_items FROM anon;

GRANT SELECT (
  id, tenant_id, venue_id, order_number, table_number, status,
  subtotal, tax, total, created_at, updated_at, completed_at,
  service_type, tax_amount, service_charge_amount, discount_amount,
  payment_method, payment_status, paid_at, coupon_id, assigned_to,
  cashier_id, server_id, display_currency, tip_amount, preparation_zone
) ON public.orders TO anon;

GRANT SELECT (
  id, order_id, menu_item_id, quantity, price_at_order,
  item_name, item_name_en, created_at, item_status, course,
  modifiers, preparation_zone
) ON public.order_items TO anon;
