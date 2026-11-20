-- Essai de 14 jours = toutes les fonctionnalites (decision du proprietaire, 2026-11-20)
-- ============================================================================
-- Pendant l'essai, le restaurant avait les droits de l'offre Pro. Il a desormais
-- ceux de l'offre Business: il teste tout, puis il s'abonne ou il s'arrete.
--
-- La regle du "plan effectif" etait recopiee dans TROIS triggers, et les trois
-- copies avaient deja derive entre elles:
--   - enforce_venue_plan_limit: essai = 'pro', et ne regardait pas le statut
--     (un tenant resilie ou gele gardait le plafond d'etablissements de son plan);
--   - enforce_qr_customization_entitlement: ne regardait pas le statut non plus;
--   - enforce_inventory_entitlement: excluait 'cancelled' et 'frozen', mais pas
--     'paused' ni 'pending', que getEffectivePlan ramene a 'starter'.
--
-- Cette migration ecrit la regle UNE fois, dans tenant_effective_plan(), qui
-- reproduit getEffectivePlan (src/lib/plans/features.ts) a l'identique:
--   1. essai actif (status 'trial' et trial_ends_at dans le futur) -> 'business';
--   2. statut hors ('trial', 'active', 'past_due') -> 'starter'
--      (isSubscriptionUsable: un abonnement inutilisable ne donne rien);
--   3. sinon le plan enregistre s'il est connu, 'starter' sinon.
-- Les trois triggers l'appellent. Gardes: src/lib/plans/__tests__/
-- (venues-, qr-entitlement-parity, non-entitling-status) et
-- supabase/tests/rls/plan_effectif_essai_business.test.sql.
--
-- Additive et rejouable: CREATE OR REPLACE, aucune table ni colonne touchee.
--
-- Rollback: rejouer les corps des fonctions depuis les migrations
-- 20260711080000, 20260717120000 et 20260808000100, puis
--   drop function if exists public.tenant_effective_plan(uuid);
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tenant_effective_plan(p_tenant_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN t.subscription_status = 'trial'
         AND t.trial_ends_at IS NOT NULL
         AND t.trial_ends_at > now() THEN 'business'
    WHEN t.subscription_status IS NULL
         OR t.subscription_status NOT IN ('trial', 'active', 'past_due') THEN 'starter'
    WHEN t.subscription_plan IN ('starter', 'pro', 'business', 'enterprise')
         THEN t.subscription_plan
    ELSE 'starter'
  END
  FROM (SELECT 1) AS one
  LEFT JOIN tenants t ON t.id = p_tenant_id;
$$;

-- Lue uniquement par les triggers (SECURITY DEFINER, proprietaire postgres).
-- Un client n'a pas a sonder le plan d'un autre tenant.
REVOKE EXECUTE ON FUNCTION public.tenant_effective_plan(uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- QR personnalise: Pro et plus.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_qr_customization_entitlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.tenant_effective_plan(NEW.tenant_id) NOT IN ('pro', 'business', 'enterprise') THEN
    RAISE EXCEPTION 'QR customization requires the Pro plan or higher'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- Inventaire: Pro et plus. Meme perimetre de triggers qu'avant (20260808000100).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_inventory_entitlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.tenant_effective_plan(NEW.tenant_id) NOT IN ('pro', 'business', 'enterprise') THEN
    RAISE EXCEPTION 'Inventory module requires the Pro plan or higher'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- Plafond d'etablissements (maxVenues): starter 1, pro 2, business 10,
-- enterprise illimite. Meme logique de verrou et de comptage qu'avant.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_venue_plan_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective text;
  v_max       int;
  v_count     int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('venue_cap:' || NEW.tenant_id::text));

  IF NOT (NEW.is_active = true AND (TG_OP = 'INSERT' OR OLD.is_active = false)) THEN
    RETURN NEW;
  END IF;

  v_effective := public.tenant_effective_plan(NEW.tenant_id);

  v_max := CASE v_effective
    WHEN 'starter'    THEN 1
    WHEN 'pro'        THEN 2
    WHEN 'business'   THEN 10
    WHEN 'enterprise' THEN NULL
    ELSE 1
  END;

  IF v_max IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM venues
    WHERE tenant_id = NEW.tenant_id AND is_active = true;

    IF v_count > v_max THEN
      RAISE EXCEPTION 'Venue limit reached for plan %', v_effective
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_qr_customization_entitlement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_inventory_entitlement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_venue_plan_limit() FROM PUBLIC, anon, authenticated;
