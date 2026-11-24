-- ============================================================================
-- Revue ligne par ligne, lot B2b-1: B143 (Moyenne). Enregistrer une recette ne
-- remet plus a la carte un plat que le restaurateur avait retire.
--
-- CE QUI NE TENAIT PAS. `set_recipe_tx` (et `sync_menu_availability` au
-- retour du stock) rallumaient tout plat `is_available = false` dont les
-- ingredients actifs sont en stock, sans savoir si le masquage venait du
-- moteur de stock ou du restaurateur. Enregistrer une recette, meme a
-- l'identique ou videe, faisait revenir a la carte un plat retire A LA MAIN.
--
-- LA CORRECTION.
-- 1. Colonne `menu_items.masque_par_stock boolean NOT NULL DEFAULT false`:
--    vraie quand le MOTEUR a masque le plat.
-- 2. `sync_menu_availability` la met a vrai en masquant, et ne rallume que les
--    plats ou elle est vraie (en la remettant a faux). `set_recipe_tx` aussi.
--    Ce sont les deux seules fonctions qui ecrivent `is_available` (lecture
--    du texte stocke en production, le 2026-11-24). Corps recopies de
--    `lot-b2b1/prod-fonctions.sql`; seules les lignes marquees B143 changent.
-- 3. Declencheur `trg_menu_items_masquage_manuel` (SECURITY INVOKER, il lit
--    `current_user`): quand un CLIENT (authenticated, anon, service_role)
--    change lui-meme `is_available`, le masquage devient un choix du
--    restaurateur (`masque_par_stock := false`). Les fonctions du moteur
--    sont SECURITY DEFINER (proprietaire postgres): elles ne passent pas par
--    cette remise a zero.
-- 4. PAS de reprise des donnees (decision de l'orchestrateur, contre-audit 1):
--    tous les plats existants gardent `masque_par_stock = false`. Un plat
--    aujourd'hui indisponible ne revient donc jamais seul a la carte: le
--    restaurateur le reactive a la main. En production, un seul plat est
--    indisponible, avec un ingredient en rupture, et rien ne dit s'il a ete
--    retire a la main ou par le moteur: ne pas le rallumer est le choix sur.
--
-- ORDRE DE DEPLOIEMENT: AVANT ou APRES le code en ligne: aucun code ne lit ni
-- n'ecrit la nouvelle colonne (types generes mis a jour pour suivre).
--
-- ROLLBACK: rejouer `sync_menu_availability` et `set_recipe_tx` de
-- prod-fonctions.sql, puis
--   DROP TRIGGER IF EXISTS trg_menu_items_masquage_manuel ON public.menu_items;
--   DROP FUNCTION IF EXISTS public.menu_items_masquage_manuel();
--   ALTER TABLE public.menu_items DROP COLUMN IF EXISTS masque_par_stock;
-- ============================================================================

BEGIN;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS masque_par_stock boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.menu_items.masque_par_stock IS
  'Vrai quand le moteur de stock a masque le plat (rupture). Seuls ces plats reviennent seuls a la carte.';

CREATE OR REPLACE FUNCTION public.menu_items_masquage_manuel()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon', 'service_role')
     AND NEW.is_available IS DISTINCT FROM OLD.is_available THEN
    NEW.masque_par_stock := false;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.menu_items_masquage_manuel() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.menu_items_masquage_manuel() TO service_role;

DROP TRIGGER IF EXISTS trg_menu_items_masquage_manuel ON public.menu_items;
CREATE TRIGGER trg_menu_items_masquage_manuel
  BEFORE UPDATE OF is_available ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.menu_items_masquage_manuel();

CREATE OR REPLACE FUNCTION public.sync_menu_availability(p_tenant_id uuid, p_ingredient_id uuid, p_stock_before numeric, p_stock_after numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_stock_before IS NULL OR p_stock_after IS NULL THEN
    RETURN;
  END IF;

  -- L'ingredient vient de tomber en rupture: les plats qui en dependent sortent
  -- de la carte.
  IF p_stock_after <= 0 AND p_stock_before > 0 THEN
    UPDATE public.menu_items
    SET is_available = false,
        -- B143: la cause est notee, pour ne rallumer que ce que le stock a eteint.
        masque_par_stock = true
    WHERE tenant_id = p_tenant_id
      AND is_available = true
      AND id IN (
        SELECT r.menu_item_id FROM public.recipes r
        WHERE r.ingredient_id = p_ingredient_id AND r.tenant_id = p_tenant_id
      );
    RETURN;
  END IF;

  -- L'ingredient vient de sortir de rupture: on ne rallume que les plats
  -- entierement servables.
  IF p_stock_after > 0 AND p_stock_before <= 0 THEN
    UPDATE public.menu_items mi
    SET is_available = true,
        masque_par_stock = false
    WHERE mi.tenant_id = p_tenant_id
      AND mi.is_available = false
      -- B143: jamais un plat que le restaurateur a retire lui-meme.
      AND mi.masque_par_stock
      AND EXISTS (
        SELECT 1 FROM public.recipes r
        WHERE r.menu_item_id = mi.id
          AND r.tenant_id = p_tenant_id
          AND r.ingredient_id = p_ingredient_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.recipes r2
        JOIN public.ingredients i2
          ON i2.id = r2.ingredient_id AND i2.tenant_id = p_tenant_id
        WHERE r2.menu_item_id = mi.id
          AND r2.tenant_id = p_tenant_id
          AND i2.is_active = true
          AND i2.current_stock <= 0
      );
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_recipe_tx(p_tenant_id uuid, p_menu_item_id uuid, p_lines jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_line jsonb; v_ingredient_id uuid; v_qty numeric;
BEGIN
  PERFORM public.assert_inventory_edit(p_tenant_id);
  IF NOT EXISTS (SELECT 1 FROM public.menu_items mi WHERE mi.id = p_menu_item_id AND mi.tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'MENU_ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
  LOOP
    v_ingredient_id := (v_line->>'ingredient_id')::uuid;
    v_qty := (v_line->>'quantity_needed')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ingredients i WHERE i.id = v_ingredient_id AND i.tenant_id = p_tenant_id AND i.is_active = true) THEN
      RAISE EXCEPTION 'INVALID_INGREDIENT' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  DELETE FROM public.recipes WHERE menu_item_id = p_menu_item_id AND tenant_id = p_tenant_id;
  INSERT INTO public.recipes (tenant_id, menu_item_id, ingredient_id, quantity_needed, notes)
  SELECT p_tenant_id, p_menu_item_id, (line->>'ingredient_id')::uuid, (line->>'quantity_needed')::numeric, NULLIF(line->>'notes','')
  FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) AS line;

  UPDATE public.menu_items mi
  SET is_available = true,
      masque_par_stock = false
  WHERE mi.id = p_menu_item_id
    AND mi.tenant_id = p_tenant_id
    AND mi.is_available = false
    -- B143: seul un plat masque PAR LE STOCK revient a la carte; un plat
    -- retire a la main par le restaurateur reste retire.
    AND mi.masque_par_stock
    AND NOT EXISTS (
      SELECT 1
      FROM public.recipes r
      JOIN public.ingredients i
        ON i.id = r.ingredient_id AND i.tenant_id = p_tenant_id
      WHERE r.menu_item_id = mi.id
        AND r.tenant_id = p_tenant_id
        AND i.is_active = true
        AND i.current_stock <= 0
    );
END; $function$;

REVOKE ALL ON FUNCTION public.sync_menu_availability(uuid, uuid, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_menu_availability(uuid, uuid, numeric, numeric) TO service_role;
REVOKE ALL ON FUNCTION public.set_recipe_tx(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_recipe_tx(uuid, uuid, jsonb) TO authenticated, service_role;


COMMIT;
