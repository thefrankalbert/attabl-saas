-- Security fix (L-1): stop anonymous cross-tenant enumeration of orders/order_items.
--
-- BEFORE: anon SELECT policy on orders AND order_items was `USING (true)` (added by
-- 20260622120000). PII columns were already revoked from anon at column level
-- (20260506155500), but with the public anon key an attacker could still
-- `GET /rest/v1/orders?select=order_number,table_number,total,status,...` WITHOUT any
-- filter and dump non-PII order rows for EVERY tenant -> aggregate business
-- intelligence (per-tenant order volume, ticket size, payment-method mix).
--
-- The three legitimate anonymous consumers all read by KNOWN order id(s):
--   * order-confirmed page         -> single order by id
--   * storefront/orders/[orderId]  -> single order by id
--   * ClientOrders ("mes commandes")-> orders by localStorage-stored id array
-- None needs unfiltered listing. So we route all anon reads through a SECURITY
-- DEFINER RPC scoped to (tenant_id, id = ANY(ids)) returning non-PII columns, and we
-- tighten the table policies:
--   * order_items: DROP the anon SELECT entirely (the RPC reads items internally).
--   * orders: the only remaining reason anon needs a table SELECT policy is Supabase
--     Realtime (postgres_changes), which evaluates the SELECT policy per changed row.
--     We bound it to recently-created rows so live order tracking keeps working for
--     active orders while cross-tenant enumeration is reduced to a rolling 6h window
--     of non-PII rows (historical BI value removed). Fully dropping it would require
--     migrating two customer realtime surfaces to Broadcast (a pattern used nowhere
--     else in this codebase); bounded postgres_changes is the proportionate fix for
--     this Low-severity, non-PII finding.
--
-- Rollback: re-create the two anon SELECT policies as FOR SELECT TO anon USING (true)
-- and DROP FUNCTION public.get_orders_for_tracking(uuid, uuid[]).

-- 1. Scoped read RPC: returns non-PII order data + items for orders the caller already
-- holds the id(s) of, within the given tenant. SECURITY DEFINER so it works after the
-- table policies below are tightened. Explicit SET search_path = public.
CREATE OR REPLACE FUNCTION public.get_orders_for_tracking(
  p_tenant_id uuid,
  p_order_ids uuid[]
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(o) ORDER BY o.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT
      ord.id,
      ord.order_number,
      ord.table_number,
      ord.status,
      ord.total,
      ord.subtotal,
      ord.tip_amount,
      ord.discount_amount,
      ord.tax_amount,
      ord.service_charge_amount,
      ord.service_type,
      ord.created_at,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'item_name', oi.item_name,
          'item_name_en', oi.item_name_en,
          'quantity', oi.quantity,
          'price_at_order', oi.price_at_order,
          'menu_item_id', oi.menu_item_id,
          'image_url', mi.image_url
        ))
        FROM order_items oi
        LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE oi.order_id = ord.id
      ), '[]'::jsonb) AS order_items
    FROM orders ord
    WHERE ord.tenant_id = p_tenant_id
      AND ord.id = ANY(p_order_ids)
  ) o;
$$;

REVOKE EXECUTE ON FUNCTION public.get_orders_for_tracking(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_orders_for_tracking(uuid, uuid[]) TO anon, authenticated, service_role;

-- 2. order_items: anon no longer needs any direct read (RPC reads items as definer).
DROP POLICY IF EXISTS "Order items are anon-readable for tracking" ON "public"."order_items";

-- 3. orders: keep an anon SELECT ONLY for realtime, bounded to recent rows.
DROP POLICY IF EXISTS "Orders are anon-readable for tracking" ON "public"."orders";
DROP POLICY IF EXISTS "Orders are anon-readable for active tracking" ON "public"."orders";
CREATE POLICY "Orders are anon-readable for active tracking" ON "public"."orders"
  FOR SELECT TO "anon"
  USING (created_at > (now() - interval '6 hours'));
