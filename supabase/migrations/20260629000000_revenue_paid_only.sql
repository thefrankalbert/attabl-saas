-- Revenue = paid orders only (audit finding C5).
--
-- The reporting RPCs counted every non-cancelled order as revenue, including
-- pending (never-paid) and refunded orders, and disagreed with the dashboard
-- (which used status='delivered') and the charts (which counted everything).
-- This recreates the three revenue RPCs with a single, correct predicate:
--   revenue = orders where payment_status = 'paid'
-- matching the app-layer helper src/lib/orders/revenue.ts (isPaidOrder).
--
-- Bodies are copied verbatim from the latest definitions
-- (20260623000000_secdef_cross_tenant_guard.sql) so the assert_tenant_member
-- guard, SECURITY DEFINER, and SET search_path are PRESERVED - only the
-- payment_status predicate is added. CREATE OR REPLACE keeps existing grants.
--
-- APPLY TO PROD BACKUP-FIRST: capture the live pg_get_functiondef of each
-- function before applying (prod functions have drifted ahead of the repo before
-- - see offline-first migration lesson) and confirm the only diff is the added
-- predicate. Code (dashboard) ships the same definition independently, so this is
-- additive/consistent, not access-removing.

-- 1. get_daily_revenue
CREATE OR REPLACE FUNCTION public.get_daily_revenue(
  p_tenant_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  day DATE,
  revenue NUMERIC,
  order_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    DATE(o.created_at) AS day,
    COALESCE(SUM(o.total + COALESCE(o.tip_amount, 0)), 0)::NUMERIC AS revenue,
    COUNT(o.id) AS order_count
  FROM orders o
  WHERE o.tenant_id = p_tenant_id
    AND o.created_at >= p_start_date
    AND o.created_at <= p_end_date
    AND o.status != 'cancelled'
    AND o.payment_status = 'paid'
  GROUP BY DATE(o.created_at)
  ORDER BY day ASC;
END;
$$;

-- 2. get_order_summary
CREATE OR REPLACE FUNCTION public.get_order_summary(
  p_tenant_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  total_revenue NUMERIC,
  total_orders BIGINT,
  avg_basket NUMERIC,
  total_tax NUMERIC,
  total_service_charge NUMERIC,
  total_discounts NUMERIC,
  total_tips NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    COALESCE(SUM(o.total + COALESCE(o.tip_amount, 0)), 0)::NUMERIC AS total_revenue,
    COUNT(o.id)::BIGINT AS total_orders,
    CASE WHEN COUNT(o.id) > 0
      THEN ROUND(SUM(o.total + COALESCE(o.tip_amount, 0)) / COUNT(o.id), 2)
      ELSE 0
    END::NUMERIC AS avg_basket,
    COALESCE(SUM(o.tax_amount), 0)::NUMERIC AS total_tax,
    COALESCE(SUM(o.service_charge_amount), 0)::NUMERIC AS total_service_charge,
    COALESCE(SUM(o.discount_amount), 0)::NUMERIC AS total_discounts,
    COALESCE(SUM(o.tip_amount), 0)::NUMERIC AS total_tips
  FROM orders o
  WHERE o.tenant_id = p_tenant_id
    AND o.created_at >= p_start_date
    AND o.created_at <= p_end_date
    AND o.status != 'cancelled'
    AND o.payment_status = 'paid';
END;
$$;

-- 3. get_top_items
CREATE OR REPLACE FUNCTION public.get_top_items(
  p_tenant_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  item_id UUID,
  item_name TEXT,
  quantity_sold BIGINT,
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
    oi.menu_item_id AS item_id,
    MAX(oi.item_name)::TEXT AS item_name,
    SUM(oi.quantity)::BIGINT AS quantity_sold,
    SUM(oi.quantity * oi.price_at_order)::NUMERIC AS revenue
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.tenant_id = p_tenant_id
    AND o.created_at >= p_start_date
    AND o.created_at <= p_end_date
    AND o.status != 'cancelled'
    AND o.payment_status = 'paid'
  GROUP BY oi.menu_item_id
  ORDER BY quantity_sold DESC
  LIMIT p_limit;
END;
$$;
