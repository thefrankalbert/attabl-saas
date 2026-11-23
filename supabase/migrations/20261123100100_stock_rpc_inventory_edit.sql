-- ============================================================================
-- Audit B51 (Haute): les 8 fonctions d'ecriture du stock exigent desormais le
-- droit `inventory.edit`, et l'auteur d'un mouvement vient de la session.
-- Une neuvieme fonction, `import_recipes_tx`, avait le meme defaut (signalee
-- par l'orchestrateur): elle est traitee ici de la meme facon (section 11).
--
-- CE QUI NE TENAIT PAS (verifie EN BASE par l'orchestrateur). Les fonctions
--   adjust_ingredient_stock_tx, record_loss_tx, set_recipe_tx, set_opening_stock,
--   open_stock_count, save_stock_count_lines, commit_stock_count, cancel_stock_count
-- ne controlaient que l'appartenance (`assert_tenant_member`), avec EXECUTE
-- ouvert a `authenticated`. La permission `inventory.edit` n'etait verifiee que
-- dans les Server Actions. Un serveur pouvait donc, avec sa propre session et
-- la cle publique, modifier le stock, declarer des pertes ou valider un
-- inventaire en appelant la RPC directement. Et cinq d'entre elles
-- enregistraient l'auteur (`p_created_by` / `p_committed_by`) tel qu'envoye:
-- un mouvement pouvait etre attribue a un autre employe, ce qui rendait la
-- piste anti-vol falsifiable.
--
-- LA CORRECTION.
--   1. `assert_inventory_edit(p_tenant_id)`: service_role et super-admin passent
--      (comme dans `assert_tenant_member`, et comme l'action qui admet le
--      super-admin en proprietaire virtuel); sinon `has_tenant_write_permission(
--      p_tenant_id, 'inventory.edit')`, la regle des politiques RLS du stock
--      (proprietaire, surcharges individuelles et de role, puis admin/manager).
--   2. Auteur: `auth.uid()` pour un appelant authentifie. Le parametre est GARDE
--      dans la signature (le code en ligne l'envoie toujours) mais ignore, sauf
--      pour service_role (scripts, taches planifiees) qui n'a pas d'utilisateur.
--   Les corps sont repris A L'IDENTIQUE des definitions en vigueur
--   (20261108160000_menu_availability_sync.sql pour adjust/record_loss/
--   set_recipe/commit, supabase/schema.sql instantane 20261105120000 pour les
--   quatre autres, qu'aucune migration posterieure ne touche). Seules changent
--   la ligne de controle d'acces et la source de l'auteur.
--
-- ORDRE DE DEPLOIEMENT. Le code en ligne appelle deja ces fonctions derriere la
-- garde `inventory.edit` des actions: un utilisateur legitime ne perd rien.
-- La migration peut donc passer AVANT ou APRES le code. Elle RESSERRE l'acces
-- direct par PostgREST pour les membres sans `inventory.edit` (c'est le but).
--
-- GRANTS. CREATE OR REPLACE conserve les droits; on les repose a l'identique
-- (REVOKE PUBLIC, EXECUTE a authenticated et service_role).
--
-- ROLLBACK: reposer les corps de 20261108160000, de 20260703190000
-- (import_recipes_tx) et de supabase/schema.sql (instantane 20261105120000),
-- puis DROP FUNCTION public.assert_inventory_edit(uuid).
-- ============================================================================

-- 1. La garde --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_inventory_edit(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;
  IF public.is_super_admin() THEN
    RETURN;
  END IF;
  IF public.has_tenant_write_permission(p_tenant_id, 'inventory.edit') THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'access denied: inventory.edit required on tenant %', p_tenant_id
    USING ERRCODE = '42501';
END;
$$;

ALTER FUNCTION public.assert_inventory_edit(uuid) OWNER TO postgres;
-- Appelee UNIQUEMENT depuis les RPC stock (SECURITY DEFINER, proprietaire
-- postgres): aucun client n'a besoin de l'executer directement.
REVOKE ALL ON FUNCTION public.assert_inventory_edit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_inventory_edit(uuid) TO service_role;

-- 2. adjust_ingredient_stock_tx ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.adjust_ingredient_stock_tx(
  p_tenant_id uuid, p_ingredient_id uuid, p_delta numeric, p_movement_type text,
  p_notes text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid,
  p_supplier_id uuid DEFAULT NULL::uuid
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_before NUMERIC(10,3); v_after NUMERIC(10,3);
  v_author uuid := CASE WHEN auth.role() = 'service_role' THEN p_created_by ELSE auth.uid() END;
BEGIN
  PERFORM public.assert_inventory_edit(p_tenant_id);
  IF p_movement_type NOT IN ('manual_add','manual_remove','adjustment','opening') THEN
    RAISE EXCEPTION 'INVALID_MOVEMENT_TYPE: %', p_movement_type USING ERRCODE = '22023';
  END IF;
  IF p_supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = p_supplier_id AND s.tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'INVALID_SUPPLIER' USING ERRCODE = '22023';
  END IF;
  SELECT current_stock INTO v_before FROM public.ingredients WHERE id = p_ingredient_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INGREDIENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  v_after := GREATEST(0, v_before + p_delta);
  UPDATE public.ingredients SET current_stock = v_after, updated_at = now() WHERE id = p_ingredient_id AND tenant_id = p_tenant_id;
  INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, notes, created_by, supplier_id)
  VALUES (p_tenant_id, p_ingredient_id, p_movement_type, v_after - v_before, p_notes, v_author, p_supplier_id);

  PERFORM public.sync_menu_availability(p_tenant_id, p_ingredient_id, v_before, v_after);

  RETURN v_after;
END; $$;

-- 3. record_loss_tx ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_loss_tx(
  p_tenant_id uuid, p_ingredient_id uuid, p_quantity numeric, p_reason_code text,
  p_notes text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_before NUMERIC(10,3);
  v_after  NUMERIC(10,3);
  v_author uuid := CASE WHEN auth.role() = 'service_role' THEN p_created_by ELSE auth.uid() END;
BEGIN
  PERFORM public.assert_inventory_edit(p_tenant_id);

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
    (p_tenant_id, p_ingredient_id, 'loss', v_after - v_before, p_reason_code, p_notes, v_author);

  PERFORM public.sync_menu_availability(p_tenant_id, p_ingredient_id, v_before, v_after);

  RETURN v_after;
END;
$$;

-- 4. set_recipe_tx (pas d'auteur) ------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_recipe_tx(p_tenant_id uuid, p_menu_item_id uuid, p_lines jsonb) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  SET is_available = true
  WHERE mi.id = p_menu_item_id
    AND mi.tenant_id = p_tenant_id
    AND mi.is_available = false
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
END; $$;

-- 5. set_opening_stock ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_opening_stock(
  p_tenant_id uuid, p_ingredient_id uuid, p_quantity numeric, p_created_by uuid DEFAULT NULL::uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_before NUMERIC(10,3);
  v_author uuid := CASE WHEN auth.role() = 'service_role' THEN p_created_by ELSE auth.uid() END;
BEGIN
  PERFORM public.assert_inventory_edit(p_tenant_id);
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
  VALUES (p_tenant_id, p_ingredient_id, 'opening', p_quantity - v_before, 'Stock d''ouverture', v_author);
END;
$$;

-- 6. open_stock_count -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_stock_count(
  p_tenant_id uuid, p_reference text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid,
  p_ingredient_ids uuid[] DEFAULT NULL::uuid[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count_id uuid;
  v_author uuid := CASE WHEN auth.role() = 'service_role' THEN p_created_by ELSE auth.uid() END;
BEGIN
  PERFORM public.assert_inventory_edit(p_tenant_id);
  IF EXISTS (SELECT 1 FROM public.stock_counts WHERE tenant_id = p_tenant_id AND status = 'open') THEN
    RAISE EXCEPTION 'OPEN_COUNT_EXISTS' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.stock_counts (tenant_id, reference, status, created_by)
  VALUES (p_tenant_id, NULLIF(p_reference, ''), 'open', v_author)
  RETURNING id INTO v_count_id;

  INSERT INTO public.stock_count_lines (tenant_id, count_id, ingredient_id, theoretical_qty)
  SELECT p_tenant_id, v_count_id, i.id, i.current_stock
  FROM public.ingredients i
  WHERE i.tenant_id = p_tenant_id
    AND i.is_active = true
    AND (p_ingredient_ids IS NULL OR i.id = ANY (p_ingredient_ids));

  IF NOT EXISTS (SELECT 1 FROM public.stock_count_lines WHERE count_id = v_count_id) THEN
    RAISE EXCEPTION 'NO_INGREDIENTS' USING ERRCODE = '22023';
  END IF;

  RETURN v_count_id;
END;
$$;

-- 7. save_stock_count_lines (pas d'auteur) ----------------------------------------
CREATE OR REPLACE FUNCTION public.save_stock_count_lines(p_tenant_id uuid, p_count_id uuid, p_lines jsonb) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_line jsonb;
  v_status text;
BEGIN
  PERFORM public.assert_inventory_edit(p_tenant_id);
  SELECT status INTO v_status FROM public.stock_counts
    WHERE id = p_count_id AND tenant_id = p_tenant_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COUNT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'COUNT_NOT_OPEN' USING ERRCODE = '22023'; END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
  LOOP
    IF (v_line->>'counted_qty') IS NOT NULL AND (v_line->>'counted_qty')::numeric < 0 THEN
      RAISE EXCEPTION 'INVALID_COUNTED_QTY' USING ERRCODE = '22023';
    END IF;
    UPDATE public.stock_count_lines
      SET counted_qty = NULLIF(v_line->>'counted_qty', '')::numeric
      WHERE count_id = p_count_id
        AND tenant_id = p_tenant_id
        AND ingredient_id = (v_line->>'ingredient_id')::uuid;
  END LOOP;
END;
$$;

-- 8. commit_stock_count -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.commit_stock_count(
  p_tenant_id uuid, p_count_id uuid, p_committed_by uuid DEFAULT NULL::uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
  v_line RECORD;
  v_before NUMERIC(10,3);
  v_delta NUMERIC(10,3);
  v_n INT := 0;
  v_author uuid := CASE WHEN auth.role() = 'service_role' THEN p_committed_by ELSE auth.uid() END;
BEGIN
  PERFORM public.assert_inventory_edit(p_tenant_id);

  SELECT status INTO v_status FROM public.stock_counts
    WHERE id = p_count_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COUNT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'COUNT_ALREADY_CLOSED' USING ERRCODE = '22023';
  END IF;

  FOR v_line IN
    SELECT scl.ingredient_id, scl.counted_qty
    FROM public.stock_count_lines scl
    WHERE scl.count_id = p_count_id AND scl.tenant_id = p_tenant_id
      AND scl.counted_qty IS NOT NULL
  LOOP
    SELECT current_stock INTO v_before FROM public.ingredients
      WHERE id = v_line.ingredient_id AND tenant_id = p_tenant_id
      FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_delta := v_line.counted_qty - v_before;
    IF v_delta = 0 THEN CONTINUE; END IF;

    UPDATE public.ingredients SET current_stock = v_line.counted_qty, updated_at = now()
      WHERE id = v_line.ingredient_id AND tenant_id = p_tenant_id;

    INSERT INTO public.stock_movements
      (tenant_id, ingredient_id, movement_type, quantity, reference_id, notes, created_by)
    VALUES
      (p_tenant_id, v_line.ingredient_id, 'physical_count', v_delta, p_count_id,
       'Inventaire physique', v_author);

    v_n := v_n + 1;
  END LOOP;

  -- Meme raison que dans destock_order: les verrous `menu_items` sont pris une
  -- fois toutes les lignes `ingredients` verrouillees, jamais entre deux.
  FOR v_line IN
    SELECT sm.ingredient_id, SUM(sm.quantity) AS delta
    FROM public.stock_movements sm
    WHERE sm.reference_id = p_count_id
      AND sm.tenant_id = p_tenant_id
      AND sm.movement_type = 'physical_count'
    GROUP BY sm.ingredient_id
  LOOP
    SELECT current_stock INTO v_before
    FROM public.ingredients
    WHERE id = v_line.ingredient_id AND tenant_id = p_tenant_id;
    PERFORM public.sync_menu_availability(
      p_tenant_id, v_line.ingredient_id, v_before - v_line.delta, v_before
    );
  END LOOP;

  UPDATE public.stock_counts
    SET status = 'committed', committed_at = now(), committed_by = v_author, updated_at = now()
    WHERE id = p_count_id AND tenant_id = p_tenant_id;

  RETURN v_n;
END;
$$;

-- 9. cancel_stock_count (pas d'auteur) --------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_stock_count(p_tenant_id uuid, p_count_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
BEGIN
  PERFORM public.assert_inventory_edit(p_tenant_id);
  SELECT status INTO v_status FROM public.stock_counts
    WHERE id = p_count_id AND tenant_id = p_tenant_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COUNT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'COUNT_NOT_OPEN' USING ERRCODE = '22023'; END IF;
  UPDATE public.stock_counts SET status = 'cancelled', updated_at = now()
    WHERE id = p_count_id AND tenant_id = p_tenant_id;
END;
$$;

-- 10. Droits, a l'identique de l'existant --------------------------------------
REVOKE ALL ON FUNCTION public.adjust_ingredient_stock_tx(uuid, uuid, numeric, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_ingredient_stock_tx(uuid, uuid, numeric, text, text, uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_loss_tx(uuid, uuid, numeric, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_loss_tx(uuid, uuid, numeric, text, text, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_recipe_tx(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_recipe_tx(uuid, uuid, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_opening_stock(uuid, uuid, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_opening_stock(uuid, uuid, numeric, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.open_stock_count(uuid, text, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_stock_count(uuid, text, uuid, uuid[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_stock_count_lines(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_stock_count_lines(uuid, uuid, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.commit_stock_count(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_stock_count(uuid, uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_stock_count(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_stock_count(uuid, uuid) TO authenticated, service_role;

-- 11. import_recipes_tx (ajout du coordinateur, meme defaut) ---------------------
-- Import Excel des fiches techniques. Meme defaut que les 8 fonctions ci-dessus:
-- seule l'appartenance etait verifiee, alors que les politiques RLS de
-- `recipes` exigent `inventory.edit` pour INSERT, UPDATE et DELETE (verifie en
-- lecture en production par l'orchestrateur le 2026-11-23). Corps repris a
-- l'identique de 20260703190000_recipe_import_tx.sql (identique a l'instantane
-- supabase/schema.sql), seule la ligne de controle d'acces change. Pas d'auteur.
CREATE OR REPLACE FUNCTION public.import_recipes_tx(p_tenant_id uuid, p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  PERFORM public.assert_inventory_edit(p_tenant_id);

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
$$;

REVOKE ALL ON FUNCTION public.import_recipes_tx(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_recipes_tx(uuid, jsonb) TO authenticated, service_role;
