-- Cross-tenant authorization guard for SECURITY DEFINER functions
-- (follow-up to 20260622140000_secdef_function_grants_hardening which only
--  removed the anon/PUBLIC EXECUTE grant but left the function bodies trusting
--  the caller-supplied tenant_id).
--
-- PROBLEM: SECURITY DEFINER bypasses RLS. The analytics/inventory functions take
-- a tenant_id (or user_id / coupon_id) argument and filter ONLY by that argument,
-- with no check that the authenticated caller actually owns it. get_daily_revenue,
-- get_order_summary and get_top_items are invoked from the BROWSER (anon-key
-- authenticated) client in src/hooks/queries/useReportData.ts with a client-passed
-- tenantId, so a logged-in owner of tenant A could call them with tenant B's id and
-- read B's revenue. This migration closes that cross-tenant IDOR by adding an
-- in-body ownership guard to every affected function.
--
-- DESIGN: a shared guard helper public.assert_tenant_member(uuid) that allows:
--   1. the service_role (order / signup / cron / admin flows use the service-role
--      admin client; auth.uid() is null there) - MUST keep working,
--   2. super admins (is_super_admin()),
--   3. members of the tenant (tenant_id in get_my_tenant_ids_array()),
-- and RAISEs 42501 (insufficient_privilege) otherwise. The user-scoped and
-- coupon-scoped functions get an equivalent inline guard.
--
-- IMPORTANT: every function is re-created with `SECURITY DEFINER` AND
-- `SET search_path = public` so the search_path hardening from
-- 20260402000002 / 20260424000001 is preserved (CREATE OR REPLACE without an
-- explicit SET would drop the per-function search_path and reopen the advisor
-- warning). Bodies are otherwise byte-for-byte identical to their last definition.
--
-- Rollback: re-create each function from its prior migration body (without the
-- guard line) and DROP FUNCTION public.assert_tenant_member(uuid).

-- ============================================================================
-- Shared guard helper
-- ============================================================================
CREATE OR REPLACE FUNCTION public.assert_tenant_member(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role (order / signup / cron / admin flows) bypasses tenant checks
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;
  -- super admins may act across any tenant
  IF public.is_super_admin() THEN
    RETURN;
  END IF;
  -- the authenticated caller must belong to the tenant
  IF p_tenant_id = ANY (public.get_my_tenant_ids_array()) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'access denied: caller is not a member of tenant %', p_tenant_id
    USING ERRCODE = '42501';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_tenant_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_tenant_member(uuid) TO authenticated, service_role;

-- ============================================================================
-- A. Tenant-scoped functions (first arg = tenant_id) -> assert_tenant_member
-- ============================================================================

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
    AND o.status != 'cancelled';
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
  GROUP BY oi.menu_item_id
  ORDER BY quantity_sold DESC
  LIMIT p_limit;
END;
$$;

-- 4. get_stock_status
CREATE OR REPLACE FUNCTION public.get_stock_status(p_tenant_id UUID)
RETURNS TABLE (
  id UUID, name TEXT, unit TEXT, current_stock NUMERIC,
  min_stock_alert NUMERIC, cost_per_unit NUMERIC, category TEXT,
  is_active BOOLEAN, nb_items_using BIGINT, is_low BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    i.id, i.name, i.unit, i.current_stock, i.min_stock_alert,
    i.cost_per_unit, i.category, i.is_active,
    COUNT(DISTINCT r.menu_item_id) AS nb_items_using,
    (i.current_stock <= i.min_stock_alert AND i.min_stock_alert > 0) AS is_low
  FROM public.ingredients i
  LEFT JOIN public.recipes r ON r.ingredient_id = i.id AND r.tenant_id = p_tenant_id
  WHERE i.tenant_id = p_tenant_id AND i.is_active = true
  GROUP BY i.id, i.name, i.unit, i.current_stock, i.min_stock_alert,
           i.cost_per_unit, i.category, i.is_active
  ORDER BY i.name;
END;
$$;

-- 5. adjust_ingredient_stock
CREATE OR REPLACE FUNCTION public.adjust_ingredient_stock(
  p_tenant_id UUID,
  p_ingredient_id UUID,
  p_delta NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  UPDATE public.ingredients
  SET current_stock = GREATEST(0, current_stock + p_delta),
      updated_at = now()
  WHERE id = p_ingredient_id
    AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingredient not found: % for tenant %', p_ingredient_id, p_tenant_id;
  END IF;
END;
$$;

-- 6. set_opening_stock
CREATE OR REPLACE FUNCTION public.set_opening_stock(
  p_tenant_id UUID,
  p_ingredient_id UUID,
  p_quantity NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  UPDATE public.ingredients
  SET current_stock = p_quantity, updated_at = now()
  WHERE id = p_ingredient_id AND tenant_id = p_tenant_id;

  INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, notes)
  VALUES (p_tenant_id, p_ingredient_id, 'opening', p_quantity, 'Stock d''ouverture');
END;
$$;

-- ============================================================================
-- B. User-scoped function (arg = auth user id) -> caller must be that user
-- ============================================================================

-- 7. get_owner_dashboard (was LANGUAGE sql; converted to plpgsql to RAISE on
--    cross-user access. Query body unchanged.)
CREATE OR REPLACE FUNCTION public.get_owner_dashboard(p_user_id uuid)
RETURNS TABLE(
  tenant_id uuid,
  tenant_name text,
  tenant_slug text,
  tenant_plan text,
  tenant_status text,
  tenant_logo_url text,
  tenant_is_active boolean,
  orders_today bigint,
  revenue_today numeric,
  orders_month bigint,
  revenue_month numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.is_super_admin() OR p_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'access denied: cannot read dashboard for another user'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.slug,
    t.subscription_plan,
    t.subscription_status,
    t.logo_url,
    t.is_active,
    COUNT(o.id) FILTER (WHERE o.created_at >= CURRENT_DATE),
    COALESCE(SUM(o.total) FILTER (WHERE o.created_at >= CURRENT_DATE), 0),
    COUNT(o.id) FILTER (WHERE o.created_at >= date_trunc('month', CURRENT_DATE)),
    COALESCE(SUM(o.total) FILTER (WHERE o.created_at >= date_trunc('month', CURRENT_DATE)), 0)
  FROM restaurant_groups g
  JOIN tenants t ON t.group_id = g.id
  LEFT JOIN orders o ON o.tenant_id = t.id
  WHERE g.owner_user_id = p_user_id
  GROUP BY t.id, t.name, t.slug, t.subscription_plan, t.subscription_status, t.logo_url, t.is_active
  ORDER BY t.name;
END;
$$;

-- ============================================================================
-- C. Admin-row-scoped function (arg = admin_users.id) -> caller must own the row
-- ============================================================================

-- 8. increment_login_count
CREATE OR REPLACE FUNCTION public.increment_login_count(admin_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM admin_users
      WHERE id = admin_user_id AND user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'access denied: cannot update login count for another admin'
      USING ERRCODE = '42501';
  END IF;
  UPDATE admin_users
  SET last_login_at = NOW(),
      login_count = COALESCE(login_count, 0) + 1
  WHERE id = admin_user_id;
END;
$$;

-- ============================================================================
-- D. Coupon-scoped functions (arg = coupon_id) -> caller must own coupon's tenant
--    (service_role bypass keeps the public order flow working; these are only
--     invoked on the service-role client today, the guard is defense-in-depth.)
-- ============================================================================

-- 9. claim_coupon_usage
CREATE OR REPLACE FUNCTION public.claim_coupon_usage(p_coupon_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INT;
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM coupons c
      WHERE c.id = p_coupon_id
        AND c.tenant_id = ANY (public.get_my_tenant_ids_array())
    )
  ) THEN
    RAISE EXCEPTION 'access denied: coupon does not belong to caller tenant'
      USING ERRCODE = '42501';
  END IF;
  UPDATE coupons
  SET current_uses = current_uses + 1, updated_at = NOW()
  WHERE id = p_coupon_id
    AND is_active = true
    AND (max_uses IS NULL OR current_uses < max_uses)
    AND (valid_until IS NULL OR valid_until > NOW());

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- 10. unclaim_coupon_usage
CREATE OR REPLACE FUNCTION public.unclaim_coupon_usage(p_coupon_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM coupons c
      WHERE c.id = p_coupon_id
        AND c.tenant_id = ANY (public.get_my_tenant_ids_array())
    )
  ) THEN
    RAISE EXCEPTION 'access denied: coupon does not belong to caller tenant'
      USING ERRCODE = '42501';
  END IF;
  UPDATE coupons
  SET current_uses = GREATEST(current_uses - 1, 0), updated_at = NOW()
  WHERE id = p_coupon_id;
END;
$$;

-- ============================================================================
-- E. Dead function removal: increment_coupon_usage has no runtime caller
--    (superseded by the atomic claim_coupon_usage). Drop it rather than guard it.
-- ============================================================================
DROP FUNCTION IF EXISTS public.increment_coupon_usage(uuid);
