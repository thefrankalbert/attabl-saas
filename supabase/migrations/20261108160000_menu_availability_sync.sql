-- Disponibilite des plats pilotee par le stock: une seule regle, un seul endroit.
--
-- CE QUI NE MARCHAIT PAS (reproduit en banc local, tests/integration/stock/
-- destock-edge-cases.test.ts et availability-sync.test.ts)
--
--  1. Un plat masque A LA MAIN par le restaurateur reapparaissait sur la carte
--     des qu'une commande partageant un ingredient etait annulee
--     (`restock_order`) ou qu'un inventaire physique etait valide
--     (`commit_stock_count`). Les deux remettaient `is_available = true` sur
--     TOUS les plats utilisant l'ingredient, sans regarder si le moteur les
--     avait masques: le choix du restaurateur etait ecrase.
--
--  2. Un plat etait reaffiche des qu'UN de ses ingredients repassait au-dessus
--     de zero, meme si un AUTRE ingredient de sa recette etait toujours a zero:
--     le plat revenait a la carte alors qu'il etait inservable.
--
--  3. Reception de marchandise et ajustement manuel
--     (`adjust_ingredient_stock_tx`, le chemin de "Recevoir du stock") ne
--     reaffichaient RIEN. Un plat masque automatiquement a l'epuisement restait
--     donc hors carte apres le reapprovisionnement, sans que rien ne le signale:
--     le restaurateur devait deviner d'aller le rallumer dans l'ecran Menu.
--
-- LA REGLE, DESORMAIS UNIQUE (public.sync_menu_availability)
--   - stock qui PASSE a <= 0  -> masquer les plats qui en dependent. La regle
--     etant partagee, un retrait manuel ou un ajustement negatif qui amene un
--     ingredient a 0 masque DESORMAIS les plats concernes, comme le faisaient
--     deja la vente et la perte. C'est voulu: un plat inservable ne doit pas
--     rester commandable.
--   - stock qui REPASSE > 0   -> reafficher seulement les plats dont TOUTE la
--     recette est en stock, et seulement sur cette transition.
--   Hors transition, `is_available` appartient au restaurateur: on n'y touche pas.
--
-- UN INGREDIENT DESACTIVE NE BLOQUE RIEN: `is_active = false` retire
-- l'ingredient des ecrans de stock, donc plus aucun mouvement ne pourra le faire
-- remonter. Sans le filtre `i2.is_active`, une vieille ligne de recette pointant
-- vers un ingredient desactive aurait garde le plat hors carte POUR TOUJOURS,
-- sans rien pour l'expliquer (l'ancien code le rallumait aveuglement, donc le
-- cas ne se voyait pas).
--
-- RESIDU ASSUME: si le restaurateur masque un plat A LA MAIN *et* qu'un
-- ingredient de ce plat tombe ensuite a zero puis remonte, le plat est
-- reaffiche. Distinguer les deux demanderait de stocker la cause du masquage
-- (colonne dediee sur menu_items); l'ordre exact des trois evenements est trop
-- rare pour le justifier aujourd'hui.
--
-- Rollback: DROP FUNCTION public.sync_menu_availability(uuid, uuid, numeric, numeric);
-- puis restaurer les corps precedents depuis
-- supabase/backups/prod-schema-20261108T135715Z.sql.

-- 1. La regle partagee ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_menu_availability(
  p_tenant_id     uuid,
  p_ingredient_id uuid,
  p_stock_before  numeric,
  p_stock_after   numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_stock_before IS NULL OR p_stock_after IS NULL THEN
    RETURN;
  END IF;

  -- L'ingredient vient de tomber en rupture: les plats qui en dependent sortent
  -- de la carte.
  IF p_stock_after <= 0 AND p_stock_before > 0 THEN
    UPDATE public.menu_items
    SET is_available = false
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
    SET is_available = true
    WHERE mi.tenant_id = p_tenant_id
      AND mi.is_available = false
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
$$;

ALTER FUNCTION public.sync_menu_availability(uuid, uuid, numeric, numeric) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sync_menu_availability(uuid, uuid, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
-- Appelee UNIQUEMENT depuis les RPC stock (toutes SECURITY DEFINER, proprietaire
-- postgres): aucun client n'a besoin de l'executer directement.

-- 2. destock_order: delegue la disponibilite ----------------------------------
CREATE OR REPLACE FUNCTION public.destock_order(
  p_order_id uuid, p_tenant_id uuid, p_created_by uuid DEFAULT NULL::uuid
) RETURNS integer
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

      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  -- La disponibilite est recalculee APRES la boucle, jamais dedans.
  -- ORDRE DE VERROUS: tous les chemins stock prennent d'abord les lignes
  -- `ingredients`, puis `menu_items`. Appeler sync dans la boucle gardait un
  -- verrou sur `menu_items` pendant qu'on allait verrouiller l'ingredient
  -- suivant, ce qui fermait un cycle avec une reception de marchandise
  -- (`adjust_ingredient_stock_tx`, qui verrouille l'ingredient puis les plats):
  -- deadlock 40P01, et ce declencheur tourne sur le chemin chaud de la prise de
  -- commande. En sortant d'ici, l'ordre est le meme partout.
  -- (Reste inchange et hors sujet ici: deux destockages concurrents peuvent
  -- encore se croiser sur deux ingredients, la boucle de recette n'ayant pas
  -- d'ordre garanti.)
  FOR v_recipe IN
    SELECT sm.ingredient_id, SUM(sm.quantity) AS delta
    FROM public.stock_movements sm
    WHERE sm.reference_id = p_order_id
      AND sm.tenant_id = p_tenant_id
      AND sm.movement_type = 'order_destock'
    GROUP BY sm.ingredient_id
  LOOP
    SELECT current_stock INTO v_new_stock
    FROM public.ingredients
    WHERE id = v_recipe.ingredient_id AND tenant_id = p_tenant_id;
    -- delta est negatif: l'etat d'avant est `apres - delta`.
    PERFORM public.sync_menu_availability(
      p_tenant_id, v_recipe.ingredient_id, v_new_stock - v_recipe.delta, v_new_stock
    );
  END LOOP;

  RETURN v_count;
END;
$$;

-- 3. restock_order: ne rallume plus aveuglement -------------------------------
CREATE OR REPLACE FUNCTION public.restock_order(
  p_order_id uuid, p_tenant_id uuid, p_created_by uuid DEFAULT NULL::uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INT := 0;
  v_mov RECORD;
  v_new_stock NUMERIC(10,3);
  -- Ingredients effectivement recredites par CET appel, pour ne recalculer la
  -- disponibilite qu'apres la boucle (voir la note d'ordre de verrous).
  v_ids uuid[] := '{}';
  v_deltas numeric[] := '{}';
  v_i INT;
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

    v_ids := v_ids || v_mov.ingredient_id;
    v_deltas := v_deltas || ABS(v_mov.net_destocked);
    v_count := v_count + 1;
  END LOOP;

  -- Meme raison que dans destock_order: `menu_items` apres `ingredients`,
  -- jamais entre deux. Les deltas sont accumules plutot que relus depuis le
  -- ledger, pour ne traiter QUE les ingredients recredites par cet appel (un
  -- restockage partiel anterieur ne doit pas etre rejoue comme une transition).
  FOR v_i IN 1 .. COALESCE(array_length(v_ids, 1), 0) LOOP
    SELECT current_stock INTO v_new_stock
    FROM public.ingredients
    WHERE id = v_ids[v_i] AND tenant_id = p_tenant_id;
    PERFORM public.sync_menu_availability(
      p_tenant_id, v_ids[v_i], v_new_stock - v_deltas[v_i], v_new_stock
    );
  END LOOP;

  RETURN v_count;
END;
$$;

-- 4. record_loss_tx: meme regle ------------------------------------------------
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
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);

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
    (p_tenant_id, p_ingredient_id, 'loss', v_after - v_before, p_reason_code, p_notes, p_created_by);

  PERFORM public.sync_menu_availability(p_tenant_id, p_ingredient_id, v_before, v_after);

  RETURN v_after;
END;
$$;

-- 5. adjust_ingredient_stock_tx: reception / ajustement rallume le plat --------
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
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
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
  VALUES (p_tenant_id, p_ingredient_id, p_movement_type, v_after - v_before, p_notes, p_created_by, p_supplier_id);

  PERFORM public.sync_menu_availability(p_tenant_id, p_ingredient_id, v_before, v_after);

  RETURN v_after;
END; $$;

-- 6. commit_stock_count: meme regle -------------------------------------------
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
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);

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
       'Inventaire physique', p_committed_by);

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
    SET status = 'committed', committed_at = now(), committed_by = p_committed_by, updated_at = now()
    WHERE id = p_count_id AND tenant_id = p_tenant_id;

  RETURN v_n;
END;
$$;

-- 7. set_recipe_tx: une recette corrigee doit pouvoir faire revenir le plat ----
--
-- La regle de disponibilite ne rallume un plat que sur la TRANSITION d'un
-- ingredient de sa recette. Consequence si on s'arrete la: le restaurateur dont
-- le plat est masque faute de "Sauce maison" remplace cet ingredient par un
-- autre, en stock... et le plat reste hors carte, parce qu'aucun mouvement de
-- stock ne se produira plus jamais sur un ingredient "en transition" pour lui.
-- L'ancien code le rattrapait par accident (il rallumait aveuglement a la
-- premiere annulation ou au premier inventaire). On le rattrape ici
-- explicitement: editer la recette d'un plat, c'est le moment ou le
-- restaurateur s'attend a ce que la carte se remette a jour.
--
-- On ne fait que RALLUMER (jamais masquer): masquer ici sortirait de la carte un
-- plat que le restaurateur est en train de configurer.
CREATE OR REPLACE FUNCTION public.set_recipe_tx(p_tenant_id uuid, p_menu_item_id uuid, p_lines jsonb) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_line jsonb; v_ingredient_id uuid; v_qty numeric;
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
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

ALTER FUNCTION public.set_recipe_tx(uuid, uuid, jsonb) OWNER TO postgres;
