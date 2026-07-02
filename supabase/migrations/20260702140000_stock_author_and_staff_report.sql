-- Migration: 20260702140000_stock_author_and_staff_report.sql
-- ADDITIVE ONLY: two SECURITY DEFINER read RPCs + one partial index. No drops.
-- Rollback: DROP FUNCTION get_stock_movements_page(uuid,int,int),
--           get_staff_stock_report(uuid,timestamptz,timestamptz); DROP INDEX idx_stock_movements_created_by;
-- NOTE: author_name is only populated for movements whose created_by is set.
--   Manual movements already stamp created_by (adjust_ingredient_stock_tx).
--   order_destock / order_restock / opening only carry an author AFTER the
--   'ledger' chantier stamps created_by on those RPCs -> hard dependency.

BEGIN;

-- 0. Perf index for the per-author report
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_by
  ON public.stock_movements(tenant_id, created_by)
  WHERE created_by IS NOT NULL;

-- 1. Enriched, paginated movement feed (adds author_name + flattens joins)
-- Replaces the client-side PostgREST select (which cannot embed admin_users:
-- created_by has no FK, and user_id is not unique across tenants). Scalar
-- subqueries avoid any join fan-out. Tenant-scoped by assert_tenant_member.
CREATE OR REPLACE FUNCTION public.get_stock_movements_page(
  p_tenant_id uuid,
  p_limit int DEFAULT 200,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  ingredient_id uuid,
  movement_type text,
  quantity numeric,
  reference_id uuid,
  notes text,
  reason_code text,
  created_by uuid,
  supplier_id uuid,
  created_at timestamptz,
  ingredient_name text,
  ingredient_unit text,
  supplier_name text,
  author_name text,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    sm.id, sm.tenant_id, sm.ingredient_id, sm.movement_type, sm.quantity,
    sm.reference_id, sm.notes, sm.reason_code, sm.created_by, sm.supplier_id, sm.created_at,
    (SELECT i.name FROM public.ingredients i WHERE i.id = sm.ingredient_id) AS ingredient_name,
    (SELECT i.unit FROM public.ingredients i WHERE i.id = sm.ingredient_id) AS ingredient_unit,
    (SELECT s.name FROM public.suppliers s WHERE s.id = sm.supplier_id) AS supplier_name,
    (SELECT au.full_name FROM public.admin_users au
       WHERE au.user_id = sm.created_by AND au.tenant_id = sm.tenant_id
       LIMIT 1) AS author_name,
    -- Full filtered count (window runs before LIMIT) so the header count pill
    -- keeps the exact total the old count:'exact' select provided.
    COUNT(*) OVER() AS total_count
  FROM public.stock_movements sm
  WHERE sm.tenant_id = p_tenant_id
  ORDER BY sm.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 200), 0)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;
REVOKE ALL ON FUNCTION public.get_stock_movements_page(uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stock_movements_page(uuid, int, int) TO authenticated, service_role;

-- 2. 'Sorties par employe' aggregate report
CREATE OR REPLACE FUNCTION public.get_staff_stock_report(
  p_tenant_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE (
  author_id uuid,
  author_name text,
  out_qty numeric,
  in_qty numeric,
  movements_count bigint,
  manual_remove_qty numeric,
  adjustment_out_qty numeric,
  order_destock_qty numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    sm.created_by AS author_id,
    -- Use p_tenant_id (constant) not sm.tenant_id: the query GROUPs BY created_by,
    -- so a non-grouped sm.tenant_id in this subquery would be a GROUP BY error.
    (SELECT au.full_name FROM public.admin_users au
       WHERE au.user_id = sm.created_by AND au.tenant_id = p_tenant_id
       LIMIT 1) AS author_name,
    COALESCE(SUM(CASE WHEN sm.quantity < 0 THEN -sm.quantity ELSE 0 END), 0) AS out_qty,
    COALESCE(SUM(CASE WHEN sm.quantity > 0 THEN  sm.quantity ELSE 0 END), 0) AS in_qty,
    COUNT(*) AS movements_count,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'manual_remove' THEN -sm.quantity ELSE 0 END), 0) AS manual_remove_qty,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'adjustment' AND sm.quantity < 0 THEN -sm.quantity ELSE 0 END), 0) AS adjustment_out_qty,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'order_destock' THEN -sm.quantity ELSE 0 END), 0) AS order_destock_qty
  FROM public.stock_movements sm
  WHERE sm.tenant_id = p_tenant_id
    AND sm.created_by IS NOT NULL
    AND sm.created_at >= p_start
    AND sm.created_at <  p_end
  GROUP BY sm.created_by
  ORDER BY out_qty DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_staff_stock_report(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_stock_report(uuid, timestamptz, timestamptz) TO authenticated, service_role;

COMMIT;
