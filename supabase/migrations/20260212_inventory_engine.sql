-- ============================================================
-- INVENTORY ENGINE — Tables, RPCs, RLS
-- 2026-02-12
-- ============================================================

-- ─── 1. INGREDIENTS TABLE ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'pièce' CHECK (unit IN ('kg','L','pièce','cl','g','bouteille')),
  current_stock NUMERIC(10,3) NOT NULL DEFAULT 0,
  min_stock_alert NUMERIC(10,3) NOT NULL DEFAULT 0,
  cost_per_unit NUMERIC(10,2) NOT NULL DEFAULT 0,
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ingredients_tenant ON public.ingredients(tenant_id);
CREATE INDEX idx_ingredients_active ON public.ingredients(tenant_id, is_active);

-- ─── 2. RECIPES TABLE (Fiches techniques) ──────────────────

CREATE TABLE IF NOT EXISTS public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  quantity_needed NUMERIC(10,3) NOT NULL CHECK (quantity_needed > 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(menu_item_id, ingredient_id)
);

CREATE INDEX idx_recipes_tenant ON public.recipes(tenant_id);
CREATE INDEX idx_recipes_menu_item ON public.recipes(menu_item_id);
CREATE INDEX idx_recipes_ingredient ON public.recipes(ingredient_id);

-- ─── 3. STOCK MOVEMENTS TABLE (Audit trail) ────────────────

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('order_destock','manual_add','manual_remove','adjustment','opening')),
  quantity NUMERIC(10,3) NOT NULL,
  reference_id UUID,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_movements_tenant ON public.stock_movements(tenant_id);
CREATE INDEX idx_stock_movements_ingredient ON public.stock_movements(ingredient_id);
CREATE INDEX idx_stock_movements_type ON public.stock_movements(tenant_id, movement_type);
CREATE INDEX idx_stock_movements_date ON public.stock_movements(tenant_id, created_at DESC);

-- ─── 4. ITEM SUGGESTIONS TABLE ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.item_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  suggested_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  suggestion_type TEXT NOT NULL DEFAULT 'pairing' CHECK (suggestion_type IN ('pairing','upsell','alternative')),
  description TEXT,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (menu_item_id != suggested_item_id)
);

CREATE INDEX idx_item_suggestions_tenant ON public.item_suggestions(tenant_id);
CREATE INDEX idx_item_suggestions_item ON public.item_suggestions(menu_item_id);

-- ─── 5. AUTO-UPDATE updated_at TRIGGER ──────────────────────

CREATE OR REPLACE FUNCTION public.update_ingredients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ingredients_updated_at
  BEFORE UPDATE ON public.ingredients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ingredients_updated_at();

-- ─── 6. RPC: destock_order ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.destock_order(
  p_order_id UUID,
  p_tenant_id UUID
)
RETURNS INT AS $$
DECLARE
  v_count INT := 0;
  v_item RECORD;
  v_recipe RECORD;
  v_new_stock NUMERIC(10,3);
BEGIN
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
      UPDATE public.ingredients
      SET current_stock = current_stock - (v_recipe.quantity_needed * v_item.quantity)
      WHERE id = v_recipe.ingredient_id
        AND tenant_id = p_tenant_id
      RETURNING current_stock INTO v_new_stock;

      INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, reference_id)
      VALUES (
        p_tenant_id, v_recipe.ingredient_id, 'order_destock',
        -(v_recipe.quantity_needed * v_item.quantity), p_order_id
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 7. RPC: set_opening_stock ──────────────────────────────

CREATE OR REPLACE FUNCTION public.set_opening_stock(
  p_tenant_id UUID,
  p_ingredient_id UUID,
  p_quantity NUMERIC
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.ingredients
  SET current_stock = p_quantity, updated_at = now()
  WHERE id = p_ingredient_id AND tenant_id = p_tenant_id;

  INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, notes)
  VALUES (p_tenant_id, p_ingredient_id, 'opening', p_quantity, 'Stock d''ouverture');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 8. RPC: get_stock_status ───────────────────────────────

CREATE OR REPLACE FUNCTION public.get_stock_status(p_tenant_id UUID)
RETURNS TABLE (
  id UUID, name TEXT, unit TEXT, current_stock NUMERIC,
  min_stock_alert NUMERIC, cost_per_unit NUMERIC, category TEXT,
  is_active BOOLEAN, nb_items_using BIGINT, is_low BOOLEAN
) AS $$
BEGIN
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 9. RLS POLICIES ───────────────────────────────────────

ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_suggestions ENABLE ROW LEVEL SECURITY;

-- Ingredients
CREATE POLICY ingredients_select ON public.ingredients FOR SELECT
  USING (tenant_id IN (SELECT au.tenant_id FROM public.admin_users au WHERE au.user_id = auth.uid()));
CREATE POLICY ingredients_insert ON public.ingredients FOR INSERT
  WITH CHECK (tenant_id IN (SELECT au.tenant_id FROM public.admin_users au WHERE au.user_id = auth.uid()));
CREATE POLICY ingredients_update ON public.ingredients FOR UPDATE
  USING (tenant_id IN (SELECT au.tenant_id FROM public.admin_users au WHERE au.user_id = auth.uid()));

-- Recipes
CREATE POLICY recipes_select ON public.recipes FOR SELECT
  USING (tenant_id IN (SELECT au.tenant_id FROM public.admin_users au WHERE au.user_id = auth.uid()));
CREATE POLICY recipes_insert ON public.recipes FOR INSERT
  WITH CHECK (tenant_id IN (SELECT au.tenant_id FROM public.admin_users au WHERE au.user_id = auth.uid()));
CREATE POLICY recipes_update ON public.recipes FOR UPDATE
  USING (tenant_id IN (SELECT au.tenant_id FROM public.admin_users au WHERE au.user_id = auth.uid()));
CREATE POLICY recipes_delete ON public.recipes FOR DELETE
  USING (tenant_id IN (SELECT au.tenant_id FROM public.admin_users au WHERE au.user_id = auth.uid()));

-- Stock movements (audit trail: read + insert only)
CREATE POLICY stock_movements_select ON public.stock_movements FOR SELECT
  USING (tenant_id IN (SELECT au.tenant_id FROM public.admin_users au WHERE au.user_id = auth.uid()));
CREATE POLICY stock_movements_insert ON public.stock_movements FOR INSERT
  WITH CHECK (tenant_id IN (SELECT au.tenant_id FROM public.admin_users au WHERE au.user_id = auth.uid()));

-- Item suggestions
CREATE POLICY item_suggestions_select ON public.item_suggestions FOR SELECT
  USING (tenant_id IN (SELECT au.tenant_id FROM public.admin_users au WHERE au.user_id = auth.uid()));
CREATE POLICY item_suggestions_insert ON public.item_suggestions FOR INSERT
  WITH CHECK (tenant_id IN (SELECT au.tenant_id FROM public.admin_users au WHERE au.user_id = auth.uid()));
CREATE POLICY item_suggestions_update ON public.item_suggestions FOR UPDATE
  USING (tenant_id IN (SELECT au.tenant_id FROM public.admin_users au WHERE au.user_id = auth.uid()));
CREATE POLICY item_suggestions_delete ON public.item_suggestions FOR DELETE
  USING (tenant_id IN (SELECT au.tenant_id FROM public.admin_users au WHERE au.user_id = auth.uid()));

-- ─── 10. ENABLE REALTIME ────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.ingredients;
