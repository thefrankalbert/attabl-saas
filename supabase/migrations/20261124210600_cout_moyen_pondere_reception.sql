-- ============================================================================
-- Verification de mise en production du 2026-11-24, test du module de stock,
-- soupcon a (rapport ui-stock.md, constat 4). Decision du proprietaire du
-- 2026-11-24: chaque livraison saisie avec un prix d'achat recalcule le cout
-- unitaire du produit (cout moyen pondere, CUMP); sans prix saisi, le cout ne
-- change pas.
--
-- CE QUI NE TENAIT PAS. `adjust_ingredient_stock_tx` (corps stocke relu) ne
-- touchait que `current_stock`. Farine: stock 15 a 1000, livraison de
-- 0.125 kg a 1500 -> cout toujours 1000 au lieu de 1004.13. Le seul moyen de
-- changer le cout etait "Modifier", qui l'ecrase. La valeur du stock et le
-- cout des pertes suivaient un cout que personne ne mettait a jour.
--
-- LA CORRECTION.
-- 1. `stock_movements.unit_cost` (numeric(12,4), nullable): le prix d'achat
--    par unite de STOCK d'une reception, garde pour l'historique. NULL pour
--    tout autre mouvement et pour une reception sans prix. Lecture: la table
--    a un SELECT de table pour authenticated (lignes bornees par la RLS de
--    20261124210200), la colonne est donc lisible comme les autres; aucune
--    ecriture directe n'existe plus (20261124210100).
-- 2. `adjust_ingredient_stock_tx` recoit un 8e parametre `p_unit_cost`
--    (DEFAULT NULL), en unite de stock. Regle, dans la MEME transaction que
--    la mise a jour du stock et l'insertion du mouvement, sous le verrou de
--    ligne `FOR UPDATE` deja pris sur le produit (deux receptions simultanees
--    se suivent, la seconde lit le cout et le stock laisses par la premiere):
--      prix  = round(p_unit_cost, 4)
--      avant = greatest(stock_avant, 0)   -- un stock negatif ne compte pas
--      si avant = 0: cout = round(prix, 2)
--      sinon       : cout = round((avant x cout_avant + quantite x prix)
--                                 / (avant + quantite), 2)
--    Arrondi a 2 decimales: c'est le type de `ingredients.cost_per_unit`
--    (numeric(10,2)), la representation des couts de stock dans ce depot
--    (les montants de commande, eux, sont en entiers FCFA). Le cout moyen
--    reste entre l'ancien cout et le prix recu: il ne peut pas depasser la
--    borne de la colonne si le prix la respecte (controle ci-dessous).
--    Le prix n'est accepte que pour une reception (`manual_add`, quantite
--    > 0), strictement positif et au plus 99 999 999.99; sinon 22023
--    INVALID_UNIT_COST. Sans prix (NULL), le cout ne change pas.
--    Le reste du corps est celui de 20261124150200 (stock exact, y compris
--    sous zero: -2 + 4 = 2), avec la garde `assert_inventory_edit`, l'auteur
--    force et `sync_menu_availability`. SECURITY DEFINER, proprietaire
--    postgres: la garde du registre (20261124210100) le laisse ecrire
--    `current_stock`, comme avant.
-- 3. L'ancienne surcharge a 7 parametres est SUPPRIMEE. Garder les deux
--    rendrait ambigu tout appel a 7 arguments nommes (PostgREST ne saurait pas
--    choisir: PGRST203) et tout appel SQL positionnel a 4-7 arguments. Avec la
--    seule nouvelle signature, les appels existants (code en production,
--    `destock_order` ne l'appelle pas: il n'en parle qu'en commentaire, tests
--    pgTAP positionnels a 4 arguments, tests d'integration a 7 nommes)
--    continuent de marcher grace au DEFAULT NULL.
-- GRANT/REVOKE reposes a l'identique: EXECUTE a authenticated et service_role,
-- rien a PUBLIC ni anon.
--
-- ORDRE DE MISE EN LIGNE: migration D'ABORD, code ensuite. Le code en ligne
-- (7 arguments nommes) marche avec la nouvelle fonction (p_unit_cost NULL,
-- cout inchange, comme aujourd'hui). Le nouveau code envoie `p_unit_cost`:
-- deploye avant la migration, PostgREST ne trouverait aucune fonction avec ce
-- parametre (PGRST202) et toute reception echouerait.
--
-- ROLLBACK (apres avoir redeploye un code qui n'envoie plus p_unit_cost):
--   DROP FUNCTION IF EXISTS public.adjust_ingredient_stock_tx(uuid, uuid, numeric, text, text, uuid, uuid, numeric);
--   -- puis rejouer le CREATE FUNCTION de adjust_ingredient_stock_tx et ses
--   -- REVOKE/GRANT tels qu'ecrits dans 20261124150200_stock_negatif_pertes_ajustements.sql
--   ALTER TABLE public.stock_movements DROP COLUMN IF EXISTS unit_cost;
-- Les couts recalcules entre-temps restent dans `ingredients.cost_per_unit`
-- (ce sont des couts reels; "Modifier" permet de les corriger a la main).
-- ============================================================================

BEGIN;

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS unit_cost numeric(12,4);

ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_unit_cost_positive;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_unit_cost_positive CHECK (unit_cost IS NULL OR unit_cost > 0);

COMMENT ON COLUMN public.stock_movements.unit_cost IS
  'Prix d achat par unite de stock saisi a la reception (manual_add). NULL sinon. Sert au cout moyen pondere.';

DROP FUNCTION IF EXISTS public.adjust_ingredient_stock_tx(uuid, uuid, numeric, text, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.adjust_ingredient_stock_tx(
  p_tenant_id uuid,
  p_ingredient_id uuid,
  p_delta numeric,
  p_movement_type text,
  p_notes text DEFAULT NULL::text,
  p_created_by uuid DEFAULT NULL::uuid,
  p_supplier_id uuid DEFAULT NULL::uuid,
  p_unit_cost numeric DEFAULT NULL::numeric
)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_before NUMERIC(10,3); v_after NUMERIC(10,3);
  v_cost_before NUMERIC(10,2);
  v_price NUMERIC(12,4);
  v_base NUMERIC;
  v_author uuid := CASE WHEN auth.role() = 'service_role' THEN p_created_by ELSE auth.uid() END;
BEGIN
  PERFORM public.assert_inventory_edit(p_tenant_id);
  IF p_movement_type NOT IN ('manual_add','manual_remove','adjustment','opening') THEN
    RAISE EXCEPTION 'INVALID_MOVEMENT_TYPE: %', p_movement_type USING ERRCODE = '22023';
  END IF;
  IF p_supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = p_supplier_id AND s.tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'INVALID_SUPPLIER' USING ERRCODE = '22023';
  END IF;
  -- CUMP: un prix d'achat n'a de sens que pour une reception, et il doit
  -- tenir dans la colonne du cout (numeric(10,2)).
  IF p_unit_cost IS NOT NULL THEN
    IF p_movement_type <> 'manual_add' OR p_delta IS NULL OR p_delta <= 0 THEN
      RAISE EXCEPTION 'INVALID_UNIT_COST: prix accepte pour une reception seulement' USING ERRCODE = '22023';
    END IF;
    v_price := round(p_unit_cost, 4);
    IF v_price <= 0 OR v_price > 99999999.99 THEN
      RAISE EXCEPTION 'INVALID_UNIT_COST: %', p_unit_cost USING ERRCODE = '22023';
    END IF;
  END IF;
  SELECT current_stock, cost_per_unit INTO v_before, v_cost_before
    FROM public.ingredients WHERE id = p_ingredient_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INGREDIENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  -- B142: une seule regle pour toutes les sorties, celle de la vente et de la
  -- perte: le stock bouge EXACTEMENT de la quantite (-5 + 3 = -2; 8 - 9 = -1),
  -- et le mouvement porte la quantite reelle.
  v_after := v_before + p_delta;
  -- Cout moyen pondere (seulement avec un prix). Un stock negatif ne fausse
  -- pas la moyenne: il compte pour 0, et le cout devient le prix recu.
  v_base := GREATEST(v_before, 0);
  UPDATE public.ingredients
    SET current_stock = v_after,
        cost_per_unit = CASE
          WHEN v_price IS NULL THEN cost_per_unit
          WHEN v_base = 0 THEN round(v_price, 2)
          ELSE round((v_base * v_cost_before + p_delta * v_price) / (v_base + p_delta), 2)
        END,
        updated_at = now()
    WHERE id = p_ingredient_id AND tenant_id = p_tenant_id;
  INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, notes, created_by, supplier_id, unit_cost)
  VALUES (p_tenant_id, p_ingredient_id, p_movement_type, v_after - v_before, p_notes, v_author, p_supplier_id, v_price);

  PERFORM public.sync_menu_availability(p_tenant_id, p_ingredient_id, v_before, v_after);

  RETURN v_after;
END; $function$;

REVOKE ALL ON FUNCTION public.adjust_ingredient_stock_tx(uuid, uuid, numeric, text, text, uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_ingredient_stock_tx(uuid, uuid, numeric, text, text, uuid, uuid, numeric) TO authenticated, service_role;

COMMIT;
