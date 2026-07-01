-- Canonical stock ledger (back-office stock program, phase 2 - PIVOT).
--
-- Makes stock_movements the source of truth for stock. Convention: every
-- stock_movements.quantity is the SIGNED DELTA actually applied to
-- ingredients.current_stock, so SUM(quantity) per ingredient reconstructs
-- current_stock (which stays a mutable cache the RPCs write atomically).
--
-- ADDITIVE ONLY:
--  1. movement_type CHECK widened with the 4 types the later phases use
--     (physical_count, loss, transfer_in, transfer_out). This migration is the
--     SOLE owner of this CHECK; dependent phases USE these values, never re-swap.
--  2. reason_code column + CHECK (structured motifs for losses / reconciliation).
--  3. destock_order / restock_order / set_opening_stock gain a trailing
--     p_created_by uuid DEFAULT NULL so the acting user is stamped on the ledger
--     (anti-vol #16). Old 2-/3-arg calls keep working (default NULL = system).
--     set_opening_stock now records the DELTA (new - before) instead of the
--     absolute quantity, so the ledger invariant SUM == current_stock holds.
--
-- Bodies are rebuilt VERBATIM from the LIVE definitions (destock=20260629000100,
-- restock+adjust=20260629120000, opening=20260623000000) with only the additive
-- changes above. DROP+CREATE erases grants, so each function re-REVOKEs/GRANTs in
-- this same migration.
--
-- APPLY TO PROD BACKUP-FIRST: additive + backward-compatible (no access removed,
-- no column dropped). Verified locally via `pnpm test:db` before prod.
-- Rollback: recreate the 2-/3-arg function signatures from the source migrations
-- above; the CHECK values and reason_code column can safely remain.

BEGIN;

-- 1. movement_type CHECK: additive widening -------------------------------------
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type IN (
    'order_destock', 'order_restock', 'manual_add', 'manual_remove',
    'adjustment', 'opening', 'physical_count', 'loss', 'transfer_in', 'transfer_out'
  ));

-- 2. reason_code: structured motifs (nullable, closed enum) ----------------------
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS reason_code TEXT;
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_reason_code_check;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_reason_code_check
  CHECK (reason_code IS NULL OR reason_code IN (
    'expired', 'breakage', 'theft', 'spillage', 'prep_waste', 'recount', 'reconcile', 'other'
  ));

-- 3. destock_order + p_created_by (system path = NULL for anon storefront) --------
DROP FUNCTION IF EXISTS public.destock_order(uuid, uuid);
CREATE OR REPLACE FUNCTION public.destock_order(
  p_order_id uuid,
  p_tenant_id uuid,
  p_created_by uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INT := 0;
  v_item RECORD;
  v_recipe RECORD;
  v_new_stock NUMERIC(10,3);
  v_required NUMERIC(10,3);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('destock_order:' || p_order_id::text));

  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_id = p_order_id
      AND movement_type = 'order_destock'
  ) THEN
    RETURN 0;
  END IF;

  FOR v_item IN
    SELECT oi.menu_item_id, oi.quantity
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.order_id = p_order_id
      AND o.tenant_id = p_tenant_id
  LOOP
    FOR v_recipe IN
      SELECT r.ingredient_id, r.quantity_needed
      FROM public.recipes r
      WHERE r.menu_item_id = v_item.menu_item_id
        AND r.tenant_id = p_tenant_id
    LOOP
      v_required := v_recipe.quantity_needed * v_item.quantity;

      UPDATE public.ingredients
      SET current_stock = current_stock - v_required
      WHERE id = v_recipe.ingredient_id
        AND tenant_id = p_tenant_id
        AND current_stock >= v_required
      RETURNING current_stock INTO v_new_stock;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK';
      END IF;

      INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, reference_id, created_by)
      VALUES (
        p_tenant_id, v_recipe.ingredient_id, 'order_destock',
        -v_required, p_order_id, p_created_by
      );

      IF v_new_stock <= 0 THEN
        UPDATE public.menu_items
        SET is_available = false
        WHERE id IN (
          SELECT r2.menu_item_id FROM public.recipes r2
          WHERE r2.ingredient_id = v_recipe.ingredient_id AND r2.tenant_id = p_tenant_id
        )
        AND tenant_id = p_tenant_id AND is_available = true;
      END IF;

      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.destock_order(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.destock_order(uuid, uuid, uuid) TO service_role;

-- 4. restock_order + p_created_by -------------------------------------------------
DROP FUNCTION IF EXISTS public.restock_order(uuid, uuid);
CREATE OR REPLACE FUNCTION public.restock_order(
  p_order_id uuid,
  p_tenant_id uuid,
  p_created_by uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INT := 0;
  v_mov RECORD;
  v_new_stock NUMERIC(10,3);
BEGIN
  FOR v_mov IN
    SELECT sm.ingredient_id, SUM(sm.quantity) AS net_destocked
    FROM public.stock_movements sm
    WHERE sm.reference_id = p_order_id
      AND sm.tenant_id = p_tenant_id
      AND sm.movement_type = 'order_destock'
    GROUP BY sm.ingredient_id
    HAVING SUM(sm.quantity) < 0
  LOOP
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

    INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, reference_id, notes, created_by)
    VALUES (
      p_tenant_id, v_mov.ingredient_id, 'order_restock',
      ABS(v_mov.net_destocked), p_order_id, 'Annulation / remboursement commande', p_created_by
    );

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
$$;
REVOKE ALL ON FUNCTION public.restock_order(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restock_order(uuid, uuid, uuid) TO service_role;

-- 5. set_opening_stock + p_created_by + DELTA-recording ---------------------------
DROP FUNCTION IF EXISTS public.set_opening_stock(uuid, uuid, numeric);
CREATE OR REPLACE FUNCTION public.set_opening_stock(
  p_tenant_id uuid,
  p_ingredient_id uuid,
  p_quantity numeric,
  p_created_by uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before NUMERIC(10,3);
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  -- Lock the row and read the prior value so the ledger records the DELTA,
  -- keeping SUM(stock_movements.quantity) == ingredients.current_stock.
  SELECT current_stock INTO v_before
  FROM public.ingredients
  WHERE id = p_ingredient_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INGREDIENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.ingredients
  SET current_stock = p_quantity, updated_at = now()
  WHERE id = p_ingredient_id AND tenant_id = p_tenant_id;

  INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, notes, created_by)
  VALUES (p_tenant_id, p_ingredient_id, 'opening', p_quantity - v_before, 'Stock d''ouverture', p_created_by);
END;
$$;
REVOKE ALL ON FUNCTION public.set_opening_stock(uuid, uuid, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_opening_stock(uuid, uuid, numeric, uuid) TO authenticated, service_role;

COMMIT;
