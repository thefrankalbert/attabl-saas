-- Paywall Inventaire - application au niveau base
-- ============================================================================
-- Constat F4 du dossier de travaux. Le module Inventaire (ingredients,
-- fournisseurs, inventaire physique) est vendu avec le plan Pro. Les pages le
-- gataient (canAccessFeature('canAccessInventory')), mais PAS les Server Actions
-- - et une Server Action est un endpoint POST adressable par son Action ID. Le
-- correctif applicatif pose la garde dans les helpers de permission de chaque
-- module; ce trigger la double au niveau des donnees.
--
-- Pourquoi le doublon: les policies RLS de ces trois tables autorisent TOUT
-- membre du tenant sans aucune verification de plan. Un utilisateur connecte sur
-- un plan Starter peut donc court-circuiter l'action et ecrire directement dans
-- PostgREST (/rest/v1/ingredients) avec la cle anon. C'est un contournement de
-- paywall (meme tenant, pas de fuite entre tenants), pas un IDOR.
--
-- Il reproduit canAccessFeature EXACTEMENT (src/lib/plans/features.ts): un tenant
-- est entitle quand son plan EFFECTIF est pro/business/enterprise, ou
--   - 'pro' pendant un essai actif (status='trial' ET trial_ends_at dans le futur),
--   - sinon son propre subscription_plan, SAUF si le statut est 'cancelled' ou
--     'frozen' qui retombent sur 'starter' ('paused' et 'past_due' conservent le
--     dernier plan: arret volontaire et temporaire pour l'un, relance Stripe en
--     cours pour l'autre),
--   - 'starter' si le plan est absent ou inconnu.
-- canAccessInventory etant vrai pour pro/business/enterprise et faux pour starter,
-- l'entitlement se reduit a: essai actif OU plan dans (pro, business, enterprise).
--
-- PERIMETRE DELIBERE, corrige apres audit: seules les tables de CONFIGURATION du
-- module sont couvertes (ingredients, suppliers, stock_counts), et sur
-- `ingredients` uniquement a l'INSERT.
--
-- La premiere version armait aussi l'UPDATE sur `ingredients`. C'etait un defaut:
-- `destock_order` fait exactement cet UPDATE, une fois par ligne de recette, a
-- chaque commande payee. Le trigger y aurait fait echouer le destockage d'un
-- tenant retrograde - un probleme de facturation transforme en panne de service,
-- precisement ce que l'en-tete pretendait eviter en excluant le grand livre.
--
-- Le grand livre des mouvements (ingredient_movements) et les lignes de comptage
-- restent hors perimetre pour la meme raison. Sans ingredient ni fournisseur ni
-- comptage CREABLES, la porte est fermee la ou elle doit l'etre: a l'entree du
-- module, pas sur le chemin d'une commande en cours de service.
--
-- SECURITY DEFINER pour que le trigger lise `tenants` quel que soit le RLS de
-- l'ecrivain.
--
-- Rollback:
--   drop trigger if exists trg_enforce_inventory_entitlement on public.ingredients;
--   drop trigger if exists trg_enforce_inventory_entitlement on public.suppliers;
--   drop trigger if exists trg_enforce_inventory_entitlement on public.stock_counts;
--   drop function if exists public.enforce_inventory_entitlement();
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_inventory_entitlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan       text;
  v_status     text;
  v_trial_ends timestamptz;
  v_entitled   boolean;
BEGIN
  SELECT subscription_plan, subscription_status, trial_ends_at
    INTO v_plan, v_status, v_trial_ends
  FROM tenants
  WHERE id = NEW.tenant_id;

  -- COALESCE: si la ligne tenant est introuvable, les trois variables restent
  -- NULL et l'expression vaudrait NULL, donc `IF NOT NULL` serait faux et le
  -- trigger laisserait passer. Un paywall qui s'ouvre quand il ne sait pas n'est
  -- pas un paywall: on retombe explicitement sur 'starter', non entitle.
  v_entitled :=
    (v_status = 'trial' AND v_trial_ends IS NOT NULL AND v_trial_ends > now())
    OR (
      COALESCE(v_status, '') NOT IN ('cancelled', 'frozen')
      AND COALESCE(v_plan, 'starter') IN ('pro', 'business', 'enterprise')
    );

  IF NOT v_entitled THEN
    RAISE EXCEPTION 'Inventory module requires the Pro plan or higher'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- La creation d'un trigger n'est pas idempotente: le drop-if-exists rend la
-- migration rejouable sans erreur.
-- ingredients: INSERT SEULEMENT, et c'est important.
--
-- `destock_order` fait `UPDATE ingredients SET current_stock = ...` une fois PAR
-- LIGNE DE RECETTE, a l'interieur du verrou consultatif de la commande. Armer le
-- trigger sur UPDATE reviendrait donc a: (1) faire un SELECT sur `tenants` par
-- ligne de recette sur le chemin chaud de la prise de commande, et (2) faire
-- ECHOUER le destockage d'un tenant retrograde - dont les commandes doivent
-- continuer a passer. Le paywall doit empecher d'UTILISER le module, pas de
-- servir un client. Creer un ingredient, c'est utiliser le module; voir son
-- stock bouger parce qu'un plat est parti, non.
DROP TRIGGER IF EXISTS trg_enforce_inventory_entitlement ON public.ingredients;
CREATE TRIGGER trg_enforce_inventory_entitlement
  BEFORE INSERT ON public.ingredients
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_inventory_entitlement();

DROP TRIGGER IF EXISTS trg_enforce_inventory_entitlement ON public.suppliers;
CREATE TRIGGER trg_enforce_inventory_entitlement
  BEFORE INSERT OR UPDATE ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_inventory_entitlement();

DROP TRIGGER IF EXISTS trg_enforce_inventory_entitlement ON public.stock_counts;
CREATE TRIGGER trg_enforce_inventory_entitlement
  BEFORE INSERT OR UPDATE ON public.stock_counts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_inventory_entitlement();

-- La fonction du trigger ne doit pas etre appelable directement par un client.
REVOKE EXECUTE ON FUNCTION public.enforce_inventory_entitlement() FROM PUBLIC, anon, authenticated;
