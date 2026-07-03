-- 20260703170000_stock_losses.sql  (ADDITIVE ONLY)
-- Depends on the canonical ledger (20260702175412): movement_type CHECK already
-- allows 'loss' and stock_movements_reason_code_check already gates the reason_code
-- vocabulary. This migration adds ONLY the two loss RPCs; inert until the service
-- calls them. No enum/column/CHECK change.

-- 1. record_loss_tx: atomic decrement (clamp at 0) + reconcilable 'loss' movement
--    carrying reason_code. Mirrors adjust_ingredient_stock_tx (records the ACTUAL
--    applied delta so SUM(movements)=current_stock) and destock_order's
--    auto-unavailable flip when an ingredient hits 0.
CREATE OR REPLACE FUNCTION public.record_loss_tx(
  p_tenant_id uuid,
  p_ingredient_id uuid,
  p_quantity numeric,
  p_reason_code text,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_before NUMERIC(10,3);
  v_after  NUMERIC(10,3);
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = '22023';
  END IF;
  IF p_reason_code IS NULL OR p_reason_code NOT IN
     ('breakage','expired','theft','spillage','prep_waste','other') THEN
    RAISE EXCEPTION 'INVALID_REASON' USING ERRCODE = '22023';
  END IF;

  SELECT current_stock INTO v_before
  FROM public.ingredients
  WHERE id = p_ingredient_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INGREDIENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_after := GREATEST(0, v_before - p_quantity);

  UPDATE public.ingredients
  SET current_stock = v_after, updated_at = now()
  WHERE id = p_ingredient_id AND tenant_id = p_tenant_id;

  INSERT INTO public.stock_movements
    (tenant_id, ingredient_id, movement_type, quantity, reason_code, notes, created_by)
  VALUES
    (p_tenant_id, p_ingredient_id, 'loss', v_after - v_before, p_reason_code, p_notes, p_created_by);

  IF v_after <= 0 THEN
    UPDATE public.menu_items
    SET is_available = false
    WHERE id IN (
      SELECT r.menu_item_id FROM public.recipes r
      WHERE r.ingredient_id = p_ingredient_id AND r.tenant_id = p_tenant_id
    )
    AND tenant_id = p_tenant_id AND is_available = true;
  END IF;

  RETURN v_after;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_loss_tx(uuid, uuid, numeric, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_loss_tx(uuid, uuid, numeric, text, text, uuid) TO authenticated, service_role;

-- 2. get_losses_by_reason: report aggregation. cost_per_unit is the legacy NUMERIC
--    column (report only, NOT the dinero.js money contract).
CREATE OR REPLACE FUNCTION public.get_losses_by_reason(
  p_tenant_id uuid,
  p_start timestamptz DEFAULT NULL,
  p_end   timestamptz DEFAULT NULL
)
RETURNS TABLE (
  reason_code text,
  nb_movements bigint,
  total_qty numeric,
  total_cost_value numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    sm.reason_code,
    COUNT(*)::bigint,
    COALESCE(SUM(ABS(sm.quantity)), 0),
    COALESCE(SUM(ABS(sm.quantity) * i.cost_per_unit), 0)
  FROM public.stock_movements sm
  JOIN public.ingredients i
    ON i.id = sm.ingredient_id AND i.tenant_id = sm.tenant_id
  WHERE sm.tenant_id = p_tenant_id
    AND sm.movement_type = 'loss'
    AND (p_start IS NULL OR sm.created_at >= p_start)
    AND (p_end   IS NULL OR sm.created_at <= p_end)
  GROUP BY sm.reason_code
  ORDER BY 4 DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_losses_by_reason(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_losses_by_reason(uuid, timestamptz, timestamptz) TO authenticated, service_role;
