-- Atomic tenant-data reset RPC
-- The /api/admin/reset route previously executed 3-4 separate batched
-- deletes (order_items -> orders -> inventory_movements -> coupons.update).
-- If any step timed out in Vercel's function runtime the tenant was
-- left in a partial state (e.g. order_items orphaned, orders deleted
-- but coupon counters not reset).
--
-- This RPC does the whole thing in one transaction via SECURITY DEFINER
-- so a single TX boundary applies. Returns a JSON summary with the
-- deleted counts the route was already logging.
--
-- reset_type ∈ {'orders','statistics','all'}:
--   orders     → delete every order + its order_items for the tenant
--   statistics → delete only delivered/cancelled orders (keep active)
--   all        → orders + inventory_movements + reset coupon counters

CREATE OR REPLACE FUNCTION public.reset_tenant_data(
  p_tenant_id uuid,
  p_reset_type text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  orders_deleted int := 0;
  items_deleted int := 0;
  movements_deleted int := 0;
  coupons_reset int := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id is required' USING ERRCODE = '22023';
  END IF;

  IF p_reset_type NOT IN ('orders', 'statistics', 'all') THEN
    RAISE EXCEPTION 'Invalid reset_type: %', p_reset_type USING ERRCODE = '22023';
  END IF;

  IF p_reset_type = 'orders' THEN
    WITH del_items AS (
      DELETE FROM order_items oi
      USING orders o
      WHERE oi.order_id = o.id
        AND o.tenant_id = p_tenant_id
      RETURNING 1
    )
    SELECT count(*) INTO items_deleted FROM del_items;

    WITH del_orders AS (
      DELETE FROM orders WHERE tenant_id = p_tenant_id RETURNING 1
    )
    SELECT count(*) INTO orders_deleted FROM del_orders;

  ELSIF p_reset_type = 'statistics' THEN
    WITH del_items AS (
      DELETE FROM order_items oi
      USING orders o
      WHERE oi.order_id = o.id
        AND o.tenant_id = p_tenant_id
        AND o.status IN ('delivered', 'cancelled')
      RETURNING 1
    )
    SELECT count(*) INTO items_deleted FROM del_items;

    WITH del_orders AS (
      DELETE FROM orders
      WHERE tenant_id = p_tenant_id
        AND status IN ('delivered', 'cancelled')
      RETURNING 1
    )
    SELECT count(*) INTO orders_deleted FROM del_orders;

  ELSIF p_reset_type = 'all' THEN
    WITH del_items AS (
      DELETE FROM order_items oi
      USING orders o
      WHERE oi.order_id = o.id
        AND o.tenant_id = p_tenant_id
      RETURNING 1
    )
    SELECT count(*) INTO items_deleted FROM del_items;

    WITH del_orders AS (
      DELETE FROM orders WHERE tenant_id = p_tenant_id RETURNING 1
    )
    SELECT count(*) INTO orders_deleted FROM del_orders;

    WITH del_mov AS (
      DELETE FROM inventory_movements WHERE tenant_id = p_tenant_id RETURNING 1
    )
    SELECT count(*) INTO movements_deleted FROM del_mov;

    WITH upd_coupons AS (
      UPDATE coupons SET current_uses = 0 WHERE tenant_id = p_tenant_id RETURNING 1
    )
    SELECT count(*) INTO coupons_reset FROM upd_coupons;
  END IF;

  RETURN json_build_object(
    'reset_type', p_reset_type,
    'orders_deleted', orders_deleted,
    'items_deleted', items_deleted,
    'movements_deleted', movements_deleted,
    'coupons_reset', coupons_reset
  );
END;
$$;

-- Only service_role invokes this RPC from the /api/admin/reset handler.
-- EXECUTE is not granted to anon / authenticated by design: a future
-- authenticated caller with RLS cannot accidentally wipe tenant data.
REVOKE EXECUTE ON FUNCTION public.reset_tenant_data(uuid, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.reset_tenant_data(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_tenant_data(uuid, text) FROM authenticated;

COMMENT ON FUNCTION public.reset_tenant_data IS
  'Atomic reset of tenant data (orders, statistics, or all). SECURITY
   DEFINER + service_role-only EXECUTE. Used by /api/admin/reset to
   avoid partial resets when the batched JS loop times out.';
