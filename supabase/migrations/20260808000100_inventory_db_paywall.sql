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
--   - sinon son propre subscription_plan (les statuts cancelled / paused /
--     past_due conservent le dernier plan),
--   - 'starter' si le plan est absent ou inconnu.
-- canAccessInventory etant vrai pour pro/business/enterprise et faux pour starter,
-- l'entitlement se reduit a: essai actif OU plan dans (pro, business, enterprise).
--
-- PERIMETRE DELIBERE: seules les tables de CONFIGURATION du module sont
-- couvertes (ingredients, suppliers, stock_counts). Le grand livre des mouvements
-- (ingredient_movements) et les lignes de comptage en sont volontairement exclus:
-- ils sont ecrits par destock_order lors d'une commande, en service_role. Un
-- trigger bloquant y ferait echouer la PRISE DE COMMANDE d'un tenant qui vient de
-- retrograder - on transformerait un probleme de facturation en panne de service.
-- Sans ingredient ni fiche technique creables, la porte est deja fermee en amont.
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

  v_entitled :=
    (v_status = 'trial' AND v_trial_ends IS NOT NULL AND v_trial_ends > now())
    OR (v_plan IN ('pro', 'business', 'enterprise'));

  IF NOT v_entitled THEN
    RAISE EXCEPTION 'Inventory module requires the Pro plan or higher'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- La creation d'un trigger n'est pas idempotente: le drop-if-exists rend la
-- migration rejouable sans erreur.
DROP TRIGGER IF EXISTS trg_enforce_inventory_entitlement ON public.ingredients;
CREATE TRIGGER trg_enforce_inventory_entitlement
  BEFORE INSERT OR UPDATE ON public.ingredients
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
