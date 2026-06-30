-- Make destock_order idempotent (audit finding C6).
--
-- destock_order decremented ingredient stock unconditionally every time it ran,
-- with no guard against a second invocation for the same order. It runs OUTSIDE
-- the order transaction (Next.js after()/fire-and-forget), so a retry, a replay,
-- or any future double-call silently double-decrements stock -> real stock loss.
--
-- Fix: a transaction-level advisory lock serializes concurrent destocks for the
-- same order, and an idempotency guard returns early if this order already has
-- 'order_destock' stock_movements. Re-running is now a safe no-op. Everything
-- else (SECURITY DEFINER, search_path, tenant scoping, insufficient-stock guard,
-- auto-unavailable) is preserved verbatim.
--
-- APPLY TO PROD BACKUP-FIRST: capture the live pg_get_functiondef('public.destock_order')
-- first and confirm the only diff is the added lock + guard (prod functions have
-- drifted ahead of the repo before). Additive/backward-compatible (no access removed).

CREATE OR REPLACE FUNCTION public.destock_order(p_order_id uuid, p_tenant_id uuid)
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
  -- Serialize concurrent destocks for the same order (txn-level lock; auto-released
  -- on commit/rollback; safe with the connection pooler unlike session locks).
  PERFORM pg_advisory_xact_lock(hashtext('destock_order:' || p_order_id::text));

  -- Idempotency: if this order was already destocked, do nothing (prevents
  -- double-decrement on retry / replay / re-invocation).
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

      INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, reference_id)
      VALUES (
        p_tenant_id, v_recipe.ingredient_id, 'order_destock',
        -v_required, p_order_id
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
