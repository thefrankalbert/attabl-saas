-- ============================================================
-- FIX: Add missing adjust_ingredient_stock RPC
-- Called by inventory.service.ts adjustStock() method
-- 2026-02-12
-- ============================================================

CREATE OR REPLACE FUNCTION public.adjust_ingredient_stock(
  p_tenant_id UUID,
  p_ingredient_id UUID,
  p_delta NUMERIC
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.ingredients
  SET current_stock = GREATEST(0, current_stock + p_delta),
      updated_at = now()
  WHERE id = p_ingredient_id
    AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingredient not found: % for tenant %', p_ingredient_id, p_tenant_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
