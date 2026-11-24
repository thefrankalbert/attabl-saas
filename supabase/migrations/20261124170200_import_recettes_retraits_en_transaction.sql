-- ============================================================================
-- Audit B84 (Basse): import des fiches techniques, retraits hors transaction.
--
-- CE QUI NE TENAIT PAS. `importRecipes` (recipe-import.service.ts) appelait
-- `import_recipes_tx` pour les lignes a creer ou modifier (tout ou rien), PUIS
-- supprimait une par une, en requetes separees, les lignes marquees "retirer".
-- Un retrait en echec apres l'ecriture validee laissait un import partiel,
-- alors que l'ecran l'annonce "tout ou rien".
--
-- LA CORRECTION. `import_recipes_tx` recoit un troisieme parametre
-- `p_removals jsonb DEFAULT '[]'` ([{menu_item_id, ingredient_id}]) et fait les
-- retraits dans la MEME transaction, apres les ecritures. Le compte des lignes
-- retirees est rendu dans `recipes_removed`. Le corps des ecritures est repris
-- A L'IDENTIQUE du corps STOCKE en production (pg_get_functiondef lu le
-- 2026-11-24, version 20261123100100: garde `assert_inventory_edit`).
--
-- SECURITE. Reste SECURITY DEFINER comme la fonction qu'elle remplace (raison:
-- la garde `assert_inventory_edit(p_tenant_id)` exige `inventory.edit`, plus
-- strict que la RLS de `recipes`/`ingredients`; le test pgTAP
-- stock_rpc_inventory_edit verifie la presence de cette garde dans prosrc).
-- Chaque retrait est filtre par `tenant_id = p_tenant_id`. search_path vide,
-- noms qualifies. EXECUTE: authenticated et service_role, comme aujourd'hui;
-- retire a PUBLIC et anon.
--
-- SIGNATURE. L'ancienne fonction (uuid, jsonb) est supprimee et remplacee par
-- (uuid, jsonb, jsonb DEFAULT '[]'): l'ancien code, qui appelle avec les deux
-- seuls arguments nommes p_tenant_id et p_rows, continue de fonctionner
-- (PostgREST choisit la fonction dont les arguments manquants ont un defaut).
-- Garder les deux versions rendrait l'appel a deux arguments ambigu.
--
-- ORDRE DE DEPLOIEMENT: AVANT le code.
--   - Ancien code + cette base: appel a deux arguments, p_removals = '[]',
--     comportement identique (les retraits restent faits par l'ancien code).
--   - Nouveau code + base SANS cette migration: l'appel avec p_removals echoue
--     (fonction introuvable), l'import entier est refuse sans rien ecrire.
--
-- ROLLBACK (apres avoir remis l'ancien code): recreer la version (uuid, jsonb)
-- depuis 20261123100100_stock_rpc_inventory_edit.sql puis
--   DROP FUNCTION IF EXISTS public.import_recipes_tx(uuid, jsonb, jsonb);
--
-- Pas de BEGIN/COMMIT propre: s'applique avec `psql -1` comme les autres.
-- ============================================================================

DROP FUNCTION IF EXISTS public.import_recipes_tx(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.import_recipes_tx(
  p_tenant_id uuid,
  p_rows jsonb,
  p_removals jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
  v_recipes_removed int := 0;
BEGIN
  PERFORM public.assert_inventory_edit(p_tenant_id);

  IF p_removals IS NOT NULL AND jsonb_typeof(p_removals) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_REMOVALS' USING ERRCODE = '22023';
  END IF;

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

  -- Audit B84: retraits dans la meme transaction, filtres par restaurant.
  DELETE FROM public.recipes r
   USING jsonb_to_recordset(COALESCE(p_removals, '[]'::jsonb))
         AS x(menu_item_id uuid, ingredient_id uuid)
   WHERE r.tenant_id = p_tenant_id
     AND r.menu_item_id = x.menu_item_id
     AND r.ingredient_id = x.ingredient_id;
  GET DIAGNOSTICS v_recipes_removed = ROW_COUNT;

  RETURN jsonb_build_object(
    'recipes_created', v_recipes_created,
    'recipes_updated', v_recipes_updated,
    'ingredients_created', v_ingredients_created,
    'recipes_removed', v_recipes_removed
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.import_recipes_tx(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_recipes_tx(uuid, jsonb, jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
