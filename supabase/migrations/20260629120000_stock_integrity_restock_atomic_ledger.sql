-- Stock integrity batch: restock-on-cancel + atomic adjust ledger + atomic recipe save.
-- Additive only (new movement type value, new RPCs). Safe to apply before code is wired:
-- nothing calls these RPCs until the service is updated, and the new enum value is optional.
--
-- Fixes:
--   C2 - no restock on order cancel/refund  -> restock_order() + 'order_restock' movement type
--   M1 - ledger desync (GREATEST(0,..) clamp vs full-delta movement)
--   M2 - non-atomic adjust (RPC update + separate movement insert)
--        -> adjust_ingredient_stock_tx() does both in one statement-set and records
--           the ACTUALLY APPLIED delta so sum(movements) reconstructs current_stock.
--   M3 - non-transactional recipe save (delete-then-insert) -> set_recipe_tx().
--
-- Rollback: DROP FUNCTION restock_order, adjust_ingredient_stock_tx, set_recipe_tx;
--           the 'order_restock' CHECK value can stay (harmless).

-- 1. Allow 'order_restock' as a stock movement type ----------------------------
ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (
    movement_type IN (
      'order_destock',
      'order_restock',
      'manual_add',
      'manual_remove',
      'adjustment',
      'opening'
    )
  );

-- 2. restock_order: reverse a destock when an order is cancelled/refunded ------
-- Idempotent: only restocks ingredients that were destocked for this order and
-- have not already been restocked. Re-enables menu items that come back in stock.
CREATE OR REPLACE FUNCTION public.restock_order(p_order_id uuid, p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count INT := 0;
  v_mov RECORD;
  v_new_stock NUMERIC(10,3);
BEGIN
  -- Each destock wrote a negative-quantity 'order_destock' movement keyed by order id.
  -- Restock the exact same magnitude, once, guarding against double-restock.
  FOR v_mov IN
    SELECT sm.ingredient_id, SUM(sm.quantity) AS net_destocked
    FROM public.stock_movements sm
    WHERE sm.reference_id = p_order_id
      AND sm.tenant_id = p_tenant_id
      AND sm.movement_type = 'order_destock'
    GROUP BY sm.ingredient_id
    HAVING SUM(sm.quantity) < 0
  LOOP
    -- Skip if a restock already exists for this order+ingredient (idempotency).
    IF EXISTS (
      SELECT 1 FROM public.stock_movements r
      WHERE r.reference_id = p_order_id
        AND r.tenant_id = p_tenant_id
        AND r.movement_type = 'order_restock'
        AND r.ingredient_id = v_mov.ingredient_id
    ) THEN
      CONTINUE;
    END IF;

    UPDATE public.ingredients
    SET current_stock = current_stock + ABS(v_mov.net_destocked)
    WHERE id = v_mov.ingredient_id
      AND tenant_id = p_tenant_id
    RETURNING current_stock INTO v_new_stock;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, reference_id, notes)
    VALUES (
      p_tenant_id, v_mov.ingredient_id, 'order_restock',
      ABS(v_mov.net_destocked), p_order_id, 'Annulation / remboursement commande'
    );

    -- Bring items back to available now that an ingredient has stock again.
    IF v_new_stock > 0 THEN
      UPDATE public.menu_items
      SET is_available = true
      WHERE id IN (
        SELECT r2.menu_item_id FROM public.recipes r2
        WHERE r2.ingredient_id = v_mov.ingredient_id AND r2.tenant_id = p_tenant_id
      )
      AND tenant_id = p_tenant_id AND is_available = false;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.restock_order(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restock_order(uuid, uuid) TO service_role;

-- 3. adjust_ingredient_stock_tx: atomic manual adjust with reconcilable ledger -
-- Records the ACTUAL applied delta (after the >=0 clamp) so the movement ledger
-- always sums back to current_stock. Single function = atomic (M2). Fixes M1.
CREATE OR REPLACE FUNCTION public.adjust_ingredient_stock_tx(
  p_tenant_id uuid,
  p_ingredient_id uuid,
  p_delta numeric,
  p_movement_type text,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_before NUMERIC(10,3);
  v_after NUMERIC(10,3);
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);

  IF p_movement_type NOT IN ('manual_add', 'manual_remove', 'adjustment', 'opening') THEN
    RAISE EXCEPTION 'INVALID_MOVEMENT_TYPE: %', p_movement_type USING ERRCODE = '22023';
  END IF;

  -- Supplier (if provided) must belong to the tenant.
  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers s WHERE s.id = p_supplier_id AND s.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'INVALID_SUPPLIER' USING ERRCODE = '22023';
  END IF;

  -- Lock the row and read the pre-update value so we can record the ACTUAL applied
  -- delta after the >=0 clamp (so sum(movements) reconstructs current_stock).
  SELECT current_stock INTO v_before
  FROM public.ingredients
  WHERE id = p_ingredient_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INGREDIENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_after := GREATEST(0, v_before + p_delta);

  UPDATE public.ingredients
  SET current_stock = v_after, updated_at = now()
  WHERE id = p_ingredient_id AND tenant_id = p_tenant_id;

  INSERT INTO public.stock_movements
    (tenant_id, ingredient_id, movement_type, quantity, notes, created_by, supplier_id)
  VALUES
    (p_tenant_id, p_ingredient_id, p_movement_type, v_after - v_before, p_notes, p_created_by, p_supplier_id);

  RETURN v_after;
END;
$function$;

REVOKE ALL ON FUNCTION public.adjust_ingredient_stock_tx(uuid, uuid, numeric, text, text, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_ingredient_stock_tx(uuid, uuid, numeric, text, text, uuid, uuid)
  TO authenticated, service_role;

-- 4. set_recipe_tx: atomic replace of a menu item's recipe lines (M3) ----------
-- Takes a JSONB array of {ingredient_id, quantity_needed, notes}. Validates the
-- menu item + every ingredient belongs to the tenant, then delete+insert in one tx.
CREATE OR REPLACE FUNCTION public.set_recipe_tx(
  p_tenant_id uuid,
  p_menu_item_id uuid,
  p_lines jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_line jsonb;
  v_ingredient_id uuid;
  v_qty numeric;
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.id = p_menu_item_id AND mi.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'MENU_ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Validate each line up front.
  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
  LOOP
    v_ingredient_id := (v_line->>'ingredient_id')::uuid;
    v_qty := (v_line->>'quantity_needed')::numeric;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.ingredients i
      WHERE i.id = v_ingredient_id AND i.tenant_id = p_tenant_id AND i.is_active = true
    ) THEN
      RAISE EXCEPTION 'INVALID_INGREDIENT' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  DELETE FROM public.recipes
  WHERE menu_item_id = p_menu_item_id AND tenant_id = p_tenant_id;

  INSERT INTO public.recipes (tenant_id, menu_item_id, ingredient_id, quantity_needed, notes)
  SELECT
    p_tenant_id,
    p_menu_item_id,
    (line->>'ingredient_id')::uuid,
    (line->>'quantity_needed')::numeric,
    NULLIF(line->>'notes', '')
  FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) AS line;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_recipe_tx(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_recipe_tx(uuid, uuid, jsonb) TO authenticated, service_role;
