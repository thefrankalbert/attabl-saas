-- Order cancellation reverses side-effects (audit finding C7, part 1).
--
-- Cancelling an order previously only flipped status='cancelled' and reversed
-- nothing: the ingredients stayed deducted and a single-use coupon stayed burnt.
-- This adds the 'order_restock' movement type and a restock_order RPC (the
-- inverse of destock_order) so the cancellation service can return stock. Coupon
-- reversal reuses the existing unclaim_coupon_usage RPC from the service layer.
--
-- restock_order is idempotent (advisory lock + a guard on existing order_restock
-- movements) and only returns what was actually destocked, so it is safe to call
-- on an order that was never destocked (inventory feature off) or already
-- restocked - it is a no-op then.
--
-- APPLY TO PROD BACKUP-FIRST. Additive (new movement type + new function); the
-- CHECK is widened, never narrowed, so existing rows remain valid.

-- 1. Allow the reversing movement type.
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type = ANY (ARRAY[
    'order_destock'::text,
    'order_restock'::text,
    'manual_add'::text,
    'manual_remove'::text,
    'adjustment'::text,
    'opening'::text
  ]));

-- 2. restock_order: reverse the destock for one order. Idempotent.
CREATE OR REPLACE FUNCTION public.restock_order(p_order_id uuid, p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INT := 0;
  v_mov RECORD;
BEGIN
  -- SECURITY DEFINER bypasses RLS; restrict to members of the target tenant
  -- (same guard as the reporting RPCs). Cancellation runs as the authenticated
  -- staff client, so this is the real isolation boundary for this function.
  PERFORM public.assert_tenant_member(p_tenant_id);

  PERFORM pg_advisory_xact_lock(hashtext('restock_order:' || p_order_id::text));

  -- Already restocked -> no-op (idempotent).
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_id = p_order_id
      AND movement_type = 'order_restock'
      AND tenant_id = p_tenant_id
  ) THEN
    RETURN 0;
  END IF;

  -- Add back exactly what was destocked for this order (destock stored a negative
  -- quantity; restock adds the absolute amount).
  FOR v_mov IN
    SELECT ingredient_id, quantity
    FROM public.stock_movements
    WHERE reference_id = p_order_id
      AND movement_type = 'order_destock'
      AND tenant_id = p_tenant_id
  LOOP
    UPDATE public.ingredients
    SET current_stock = current_stock + ABS(v_mov.quantity)
    WHERE id = v_mov.ingredient_id
      AND tenant_id = p_tenant_id;

    INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, reference_id)
    VALUES (p_tenant_id, v_mov.ingredient_id, 'order_restock', ABS(v_mov.quantity), p_order_id);

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restock_order(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restock_order(uuid, uuid) TO authenticated, service_role;
