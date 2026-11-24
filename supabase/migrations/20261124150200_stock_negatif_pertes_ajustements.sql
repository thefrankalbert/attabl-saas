-- ============================================================================
-- Revue ligne par ligne, lot B2b-1: B142 (Moyenne). Pertes et ajustements de
-- stock justes a partir d'un stock negatif.
--
-- CE QUI NE TENAIT PAS. `record_loss_tx` et `adjust_ingredient_stock_tx`
-- calculaient `GREATEST(0, ...)`, regle d'avant `20261112150000` (depuis, une
-- vente peut laisser un ingredient sous zero). Sur un stock de -5: une perte
-- de 1 ou un retrait de 1 faisait MONTER le stock a 0 et inscrivait un
-- mouvement de +5 (une perte enregistree comme un gain); une reception de 3
-- donnait 0 au lieu de -2 et journalisait +5 au lieu de +3. Stock et registre
-- des mouvements devenaient faux, rapports de pertes compris.
--
-- LA CORRECTION.
-- - perte (`record_loss_tx`): `v_before - p_quantity`. Le mouvement porte la
--   quantite declaree, le stock descend d'autant, meme sous zero, comme la
--   vente. Aucune contrainte ne s'y oppose (pas de CHECK sur
--   `ingredients.current_stock` ni sur le signe de `stock_movements.quantity`).
--   Changement assume pour un stock POSITIF depasse par la perte (4 en stock,
--   perte de 9): avant 0 et -4 au registre, desormais -5 et -9.
-- - ajustement (`adjust_ingredient_stock_tx`): `v_before + p_delta`,
--   exactement, dans les deux sens (contre-audit 2: une seule regle pour
--   toutes les sorties). Un retrait de 9 sur 8 donne -1 et inscrit -9 (avant:
--   0 et -8). Cette fonction ne recoit jamais un stock CIBLE: l'ecran
--   d'ajustement (`InventoryAdjustModal.tsx`) ne propose que "Ajout",
--   "Retrait manuel" et "Stock d'ouverture", tous en quantite (le type
--   `adjustment` n'est plus propose a l'ecran et reste un retrait, signe
--   negatif, dans `inventory.service.ts`). La correction vers une valeur
--   comptee est l'inventaire physique (`commit_stock_count`, `counted_qty`),
--   fonction distincte, NON modifiee. Le message d'avertissement des deux
--   ecrans ("le stock sera ramene a 0") est corrige dans les fichiers de
--   messages ("le stock passera sous zero").
-- Le mouvement inscrit reste `v_after - v_before`: registre et stock
-- concordent toujours. Corps recopies du texte STOCKE en production (lu le
-- 2026-11-24, `lot-b2b1/prod-fonctions.sql`, version du lot B1 avec
-- `assert_inventory_edit` et l'auteur force); seule la ligne du calcul change.
-- `CREATE OR REPLACE` garde proprietaire et droits; ils sont reposes a
-- l'identique (EXECUTE a authenticated et service_role).
--
-- ORDRE DE DEPLOIEMENT: AVANT ou APRES le code en ligne (memes signatures,
-- memes valeurs de retour; seul le calcul sur stock negatif ou l'entree sur
-- stock negatif change).
--
-- ROLLBACK: rejouer les deux corps de prod-fonctions.sql (`GREATEST(0, ...)`).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_loss_tx(p_tenant_id uuid, p_ingredient_id uuid, p_quantity numeric, p_reason_code text, p_notes text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- B142: la perte porte la quantite DECLAREE et le stock descend d'autant,
  -- y compris sous zero, comme le fait deja la vente (20261112150000). Une
  -- perte ne fait jamais monter le stock et ne disparait plus du rapport des
  -- pertes (decision de l'orchestrateur, contre-audit 1).
  v_after := v_before - p_quantity;

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
$function$;

CREATE OR REPLACE FUNCTION public.adjust_ingredient_stock_tx(p_tenant_id uuid, p_ingredient_id uuid, p_delta numeric, p_movement_type text, p_notes text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- B142: une seule regle pour toutes les sorties, celle de la vente et de la
  -- perte: le stock bouge EXACTEMENT de la quantite (-5 + 3 = -2; 8 - 9 = -1),
  -- et le mouvement porte la quantite reelle.
  v_after := v_before + p_delta;
  UPDATE public.ingredients SET current_stock = v_after, updated_at = now() WHERE id = p_ingredient_id AND tenant_id = p_tenant_id;
  INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, notes, created_by, supplier_id)
  VALUES (p_tenant_id, p_ingredient_id, p_movement_type, v_after - v_before, p_notes, v_author, p_supplier_id);

  PERFORM public.sync_menu_availability(p_tenant_id, p_ingredient_id, v_before, v_after);

  RETURN v_after;
END; $function$;

REVOKE ALL ON FUNCTION public.record_loss_tx(uuid, uuid, numeric, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_loss_tx(uuid, uuid, numeric, text, text, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.adjust_ingredient_stock_tx(uuid, uuid, numeric, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_ingredient_stock_tx(uuid, uuid, numeric, text, text, uuid, uuid) TO authenticated, service_role;
