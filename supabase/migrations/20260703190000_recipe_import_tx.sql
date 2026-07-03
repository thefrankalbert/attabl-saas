-- 20260703190000_recipe_import_tx.sql  (ADDITIVE ONLY)
-- Lookup index + one atomic SECURITY DEFINER RPC for recipe (fiche technique)
-- Excel import with case-insensitive get-or-create of missing ingredients.
-- No new tables/columns, no destructive change. Suppliers import needs no
-- migration (service-level dedup by lower(name)). Inert until the code ships.
CREATE INDEX IF NOT EXISTS idx_ingredients_tenant_lower_name
  ON public.ingredients (tenant_id, lower(name));

CREATE OR REPLACE FUNCTION public.import_recipes_tx(
  p_tenant_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row jsonb;
  v_menu_item_id uuid;
  v_ing_name text;
  v_ing_unit text;
  v_qty numeric;
  v_notes text;
  v_ingredient_id uuid;
  v_existed boolean;
  v_recipes_created int := 0;
  v_recipes_updated int := 0;
  v_ingredients_created int := 0;
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);

  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb))
  LOOP
    v_menu_item_id := (v_row->>'menu_item_id')::uuid;
    v_ing_name     := btrim(v_row->>'ingredient_name');
    v_ing_unit     := v_row->>'unit';
    v_qty          := (v_row->>'quantity_needed')::numeric;
    v_notes        := NULLIF(btrim(COALESCE(v_row->>'notes','')), '');

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = '22023';
    END IF;
    IF v_ing_unit NOT IN ('kg','L','pièce','cl','g','bouteille') THEN
      RAISE EXCEPTION 'INVALID_UNIT: %', v_ing_unit USING ERRCODE = '22023';
    END IF;
    IF v_ing_name IS NULL OR v_ing_name = '' THEN
      RAISE EXCEPTION 'INVALID_INGREDIENT_NAME' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.menu_items mi
                   WHERE mi.id = v_menu_item_id AND mi.tenant_id = p_tenant_id) THEN
      RAISE EXCEPTION 'MENU_ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    SELECT id INTO v_ingredient_id
    FROM public.ingredients
    WHERE tenant_id = p_tenant_id AND lower(name) = lower(v_ing_name)
    ORDER BY is_active DESC, created_at
    LIMIT 1;

    IF v_ingredient_id IS NULL THEN
      INSERT INTO public.ingredients (tenant_id, name, unit)
      VALUES (p_tenant_id, v_ing_name, v_ing_unit)
      RETURNING id INTO v_ingredient_id;
      v_ingredients_created := v_ingredients_created + 1;
    END IF;

    SELECT EXISTS (SELECT 1 FROM public.recipes
                   WHERE menu_item_id = v_menu_item_id
                     AND ingredient_id = v_ingredient_id) INTO v_existed;

    INSERT INTO public.recipes (tenant_id, menu_item_id, ingredient_id, quantity_needed, notes)
    VALUES (p_tenant_id, v_menu_item_id, v_ingredient_id, v_qty, v_notes)
    ON CONFLICT (menu_item_id, ingredient_id)
    DO UPDATE SET quantity_needed = EXCLUDED.quantity_needed, notes = EXCLUDED.notes;

    IF v_existed THEN v_recipes_updated := v_recipes_updated + 1;
    ELSE v_recipes_created := v_recipes_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'recipes_created', v_recipes_created,
    'recipes_updated', v_recipes_updated,
    'ingredients_created', v_ingredients_created
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.import_recipes_tx(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_recipes_tx(uuid, jsonb) TO authenticated, service_role;
