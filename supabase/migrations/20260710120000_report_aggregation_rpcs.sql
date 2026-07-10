-- Report aggregation RPCs
-- ============================================================================
-- Moves the category-breakdown and server-performance aggregation OFF the
-- browser. The reports hook (useReportData) previously pulled every paid
-- order_items row (with menu_items -> categories joins) and every paid orders
-- row for the whole period to the client, then reduced them in JS just to draw
-- one pie chart and one server table. On the low-bandwidth target market that
-- raw payload was the dominant cost of the reports page. These two functions
-- return pre-aggregated rows, so the payload is proportional to the number of
-- categories / servers, not to order volume.
--
-- Semantics are preserved 1:1 with the previous client queries:
--   - paid orders only (payment_status = 'paid'); no additional status filter,
--     matching the exact rows the client aggregated before.
--   - category revenue = SUM(quantity * price_at_order), grouped by category
--     name via the INNER menu_items -> categories joins (menu_items.category_id
--     is NOT NULL, so every line resolves a category).
--   - server revenue = SUM(total + tip_amount), grouped by server.
-- Percentages (category) and avg-order (server) stay client-side: trivial math
-- over a handful of rows.
--
-- Security posture mirrors the existing report RPCs (get_order_summary,
-- get_top_items): SECURITY DEFINER + assert_tenant_member(p_tenant_id) so a
-- logged-in user cannot pass another tenant's id, EXECUTE revoked from
-- PUBLIC/anon and granted to authenticated + service_role only.
--
-- Additive migration: new functions only. Must be applied to the database
-- BEFORE the code that calls them is deployed.
-- ============================================================================

-- 1. get_category_breakdown -------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_category_breakdown(
  p_tenant_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  category TEXT,
  revenue NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    c.name::TEXT AS category,
    SUM(oi.quantity * oi.price_at_order)::NUMERIC AS revenue
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  JOIN menu_items mi ON mi.id = oi.menu_item_id
  JOIN categories c ON c.id = mi.category_id
  WHERE o.tenant_id = p_tenant_id
    AND o.created_at >= p_start_date
    AND o.created_at <= p_end_date
    AND o.payment_status = 'paid'
  GROUP BY c.name
  ORDER BY revenue DESC;
END;
$$;

-- 2. get_server_performance -------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_server_performance(
  p_tenant_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  server_id UUID,
  server_name TEXT,
  orders BIGINT,
  revenue NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    o.server_id AS server_id,
    COALESCE(au.full_name, o.server_id::TEXT)::TEXT AS server_name,
    COUNT(o.id)::BIGINT AS orders,
    SUM(o.total + COALESCE(o.tip_amount, 0))::NUMERIC AS revenue
  FROM orders o
  LEFT JOIN admin_users au ON au.id = o.server_id
  WHERE o.tenant_id = p_tenant_id
    AND o.created_at >= p_start_date
    AND o.created_at <= p_end_date
    AND o.payment_status = 'paid'
    AND o.server_id IS NOT NULL
  GROUP BY o.server_id, au.full_name
  ORDER BY orders DESC;
END;
$$;

-- Grants: same posture as the other report RPCs.
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.get_category_breakdown(uuid, timestamptz, timestamptz)',
    'public.get_server_performance(uuid, timestamptz, timestamptz)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;
