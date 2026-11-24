-- ============================================================================
-- Verification de mise en production du 2026-11-24, test du module de stock,
-- constat 2 (Haute). Le registre de stock n'est plus contournable par l'API.
--
-- CE QUI NE TENAIT PAS. Un gerant, un admin ou un proprietaire (droit
-- `inventory.edit`) ecrivait en direct par PostgREST:
--   PATCH /rest/v1/ingredients?id=eq.<id>  {"current_stock": 777}   -> 200
--   POST  /rest/v1/stock_movements          {mouvement manual_add}  -> 201
-- Le stock passait de 0 a 777 sans aucun mouvement, et un mouvement pouvait
-- etre fabrique a la main (auteur vide dans l'historique). L'invariant
-- `current_stock = SUM(stock_movements.quantity)`, sur lequel reposent
-- l'historique, les pertes valorisees et `verify_stock_ledger`, ne tenait que
-- par la discipline du code applicatif (`inventory.service.ts` exclut deja
-- `current_stock` de `updateIngredient`), pas par la base. C'est la porte
-- d'un vol de stock maquille.
--
-- LA CORRECTION.
-- 1. `ingredients.current_stock`: declencheur de garde BEFORE INSERT OR UPDATE
--    OF current_stock, SECURITY INVOKER. Pour `authenticated` et `anon`
--    (requete PostgREST directe), il refuse (42501) toute modification de
--    `current_stock` et toute creation avec un stock different de 0. Les
--    fonctions du registre (`adjust_ingredient_stock_tx`, `set_opening_stock`,
--    `record_loss_tx`, `commit_stock_count`, `destock_order`,
--    `restock_order`, `import_recipes_tx`, `reset_tenant_data`) sont SECURITY
--    DEFINER, proprietaire `postgres`: a l'interieur, `current_user` vaut
--    `postgres` et la garde les laisse passer. Elle doit rester SECURITY
--    INVOKER: en DEFINER, `current_user` vaudrait toujours le proprietaire et
--    la garde ne se declencherait jamais. `service_role` (serveur, crons,
--    jeux d'essai) n'est pas vise.
--    Pourquoi un declencheur et non un privilege de colonne: la creation d'un
--    produit (`createIngredient`) envoie `current_stock: 0` dans son INSERT;
--    retirer le privilege INSERT de la colonne casserait cette creation. Le
--    declencheur accepte 0 (le produit nait vide, son stock d'ouverture passe
--    ensuite par `set_opening_stock`) et refuse tout le reste. Il ne casse pas
--    non plus une colonne ajoutee plus tard, ce que ferait une liste de
--    privileges de colonnes.
--    Nom choisi pour s'executer APRES `trg_enforce_ingredient_update_entitlement`
--    (ordre alphabetique des declencheurs BEFORE): un restaurant sans le
--    module stock garde son refus de plan (23514), inchange.
-- 2. `stock_movements`: plus aucun INSERT, UPDATE, DELETE ni TRUNCATE pour
--    `authenticated` et `anon`, et la politique d'insertion devenue sans objet
--    est supprimee. UPDATE et DELETE n'avaient deja aucune politique (refus
--    par la RLS); TRUNCATE n'est pas expose par PostgREST mais contourne la
--    RLS: le registre est en ajout seul, par les fonctions uniquement. La
--    lecture (SELECT) est traitee par la migration suivante (20261124210200).
--
-- INVENTAIRE DU CODE APPLICATIF (src/, lu le 2026-11-24). Aucun chemin
-- n'ecrit `current_stock` ni n'insere un mouvement avec le client
-- utilisateur: creation a 0 puis `set_opening_stock`; ajustement, reception,
-- perte, inventaire par RPC; vente et annulation (`destock_order`,
-- `restock_order`) avec le client service_role. Seuls les tests
-- d'integration (`tests/integration/stock/`, client service_role) ecrivent en
-- direct: non vises.
--
-- ORDRE DE DEPLOIEMENT: RETIRE un acces, mais aucun code en ligne n'en
-- depend: applicable avant ou apres le deploiement du code.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_registre_stock_garde ON public.ingredients;
--   DROP FUNCTION IF EXISTS public.registre_stock_garde_ingredients();
--   GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.stock_movements TO authenticated;
--   CREATE POLICY "Inventory managers can insert own tenant stock_movements"
--     ON public.stock_movements FOR INSERT TO public
--     WITH CHECK (public.has_tenant_write_permission(tenant_id, 'inventory.edit'));
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.registre_stock_garde_ingredients()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Seule une requete directe d'un client est visee. Dans une fonction
  -- SECURITY DEFINER du registre, current_user est le proprietaire (postgres).
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.current_stock IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'current_stock: un produit nait a 0, son stock passe par les fonctions du registre'
      USING ERRCODE = '42501', HINT = 'stock_par_registre';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.current_stock IS DISTINCT FROM OLD.current_stock THEN
    RAISE EXCEPTION 'current_stock ne change que par les fonctions du registre de stock'
      USING ERRCODE = '42501', HINT = 'stock_par_registre';
  END IF;

  RETURN NEW;
END;
$function$;

-- Fonction de declencheur: jamais appelee directement par un client.
REVOKE ALL ON FUNCTION public.registre_stock_garde_ingredients() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registre_stock_garde_ingredients() TO service_role;

DROP TRIGGER IF EXISTS trg_registre_stock_garde ON public.ingredients;
CREATE TRIGGER trg_registre_stock_garde
  BEFORE INSERT OR UPDATE OF current_stock ON public.ingredients
  FOR EACH ROW EXECUTE FUNCTION public.registre_stock_garde_ingredients();

DROP POLICY IF EXISTS "Inventory managers can insert own tenant stock_movements" ON public.stock_movements;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.stock_movements FROM anon, authenticated;

COMMIT;
