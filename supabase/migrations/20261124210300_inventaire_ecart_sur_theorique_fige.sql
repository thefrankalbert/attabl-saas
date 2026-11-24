-- ============================================================================
-- Verification de mise en production du 2026-11-24, test du module de stock,
-- constat 6 (Moyenne). Valider un inventaire n'efface plus les ventes faites
-- pendant le comptage, et le mouvement ecrit est l'ecart affiche a l'ecran.
--
-- CE QUI NE TENAIT PAS. `commit_stock_count` ecrivait
-- `current_stock := counted_qty` et un mouvement `counted_qty - stock courant`.
-- Or le comptage compare la quantite comptee au stock THEORIQUE FIGE a
-- l'ouverture (`stock_count_lines.theoretical_qty`, rempli par
-- `open_stock_count`): c'est l'ecart que montre la feuille de comptage
-- (`StockCountSheetClient`: compte - theorique) et que calcule la colonne
-- generee `stock_count_lines.variance` (counted_qty - theoretical_qty). Mesure
-- du testeur: ouverture (Farine 13.225, Huile 39.8), saisie 12 et 39.8, vente
-- d'un plat (Farine -0.2, Huile -0.1), validation. Ecran: ecart Farine -1.225,
-- Huile 0. Base: mouvements -1.025 et +0.100. La vente de 0.1 L d'huile etait
-- annulee en silence (39.7 remis a 39.8) et l'ecart ecrit n'etait pas celui
-- affiche.
--
-- LA REGLE RETENUE. Le stock apres validation vaut la quantite comptee
-- corrigee des mouvements survenus depuis l'ouverture du comptage:
--     ecart       = counted_qty - theoretical_qty        (l'ecart affiche)
--     stock final = stock courant + ecart
--                 = counted_qty + (stock courant - theoretical_qty)
-- `stock courant - theoretical_qty` est exactement la somme des mouvements
-- depuis l'ouverture, puisque `current_stock` ne bouge que par le registre
-- (20261124210100). Le mouvement `physical_count` porte l'ecart affiche, le
-- nombre de lignes rendu est celui du dialogue ("N produit(s) avec ecart"),
-- et l'invariant stock = somme des mouvements tient.
-- Pourquoi cette regle et pas l'ancienne: la feuille presente la quantite a
-- compter face au theorique fige; la convention de l'ecran est donc que le
-- comptage photographie l'instant de l'ouverture. L'ancienne regle supposait
-- au contraire que le comptage photographiait l'instant de la VALIDATION, et
-- chaque vente faite entre la saisie et la validation disparaissait du stock
-- sans trace. Limite assumee et visible: si l'equipe compte APRES avoir servi
-- (sans rouvrir un comptage), les ventes intermediaires apparaissent comme un
-- ecart negatif SUR L'ECRAN, avant la validation, au lieu de disparaitre
-- apres. Exemple chiffre: stock 10, ouverture (theorique 10), vente de 2
-- (stock 8), comptage saisi a 9, validation: ecart -1, mouvement -1, stock
-- final 7.
--
-- Corps recopie du texte STOCKE (base du banc, identique a la derniere
-- definition 20261123100100: garde `assert_inventory_edit`, auteur force,
-- synchronisation de la carte apres verrouillage). Seuls changent la lecture
-- de `theoretical_qty` et le calcul de `v_delta`/`v_after`. Droits reposes a
-- l'identique (EXECUTE a authenticated et service_role).
--
-- ORDRE DE DEPLOIEMENT: additive (meme signature, meme valeur de retour),
-- applicable avant ou apres le code. Le code en ligne n'a rien a changer: il
-- affiche deja compte - theorique.
--
-- ROLLBACK: rejouer le corps de commit_stock_count de
-- 20261123100100_stock_rpc_inventory_edit.sql (v_delta := counted_qty - stock
-- courant; current_stock := counted_qty).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.commit_stock_count(p_tenant_id uuid, p_count_id uuid, p_committed_by uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_line RECORD;
  v_before NUMERIC(10,3);
  v_after NUMERIC(10,3);
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
    SELECT scl.ingredient_id, scl.counted_qty, scl.theoretical_qty
    FROM public.stock_count_lines scl
    WHERE scl.count_id = p_count_id AND scl.tenant_id = p_tenant_id
      AND scl.counted_qty IS NOT NULL
  LOOP
    SELECT current_stock INTO v_before FROM public.ingredients
      WHERE id = v_line.ingredient_id AND tenant_id = p_tenant_id
      FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    -- Constat 6: l'ecart est celui de l'ecran (compte - theorique fige a
    -- l'ouverture), applique au stock COURANT: les ventes, receptions et
    -- pertes enregistrees pendant le comptage sont conservees.
    v_delta := v_line.counted_qty - v_line.theoretical_qty;
    IF v_delta = 0 THEN CONTINUE; END IF;
    v_after := v_before + v_delta;

    UPDATE public.ingredients SET current_stock = v_after, updated_at = now()
      WHERE id = v_line.ingredient_id AND tenant_id = p_tenant_id;

    INSERT INTO public.stock_movements
      (tenant_id, ingredient_id, movement_type, quantity, reference_id, notes, created_by)
    VALUES
      (p_tenant_id, v_line.ingredient_id, 'physical_count', v_after - v_before, p_count_id,
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
$function$;

REVOKE ALL ON FUNCTION public.commit_stock_count(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_stock_count(uuid, uuid, uuid) TO authenticated, service_role;

COMMIT;
