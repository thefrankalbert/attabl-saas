-- Verrou de plan sur les commandes, en base (contre-audit des offres, 2026-11-20)
-- ============================================================================
-- assertOrderFeaturesAllowed (src/services/plan-enforcement.service.ts) ne
-- tourne que dans les routes de l'application. Or la RLS laisse un membre qui a
-- le droit d'encaisser inserer et modifier des commandes directement par
-- PostgREST (20261109200000_argent_orders_pay.sql). Une commande ecrite ainsi
-- pouvait porter une livraison, un service en chambre, un pourboire ou une
-- devise etrangere que le plan du restaurant n'inclut pas.
--
-- Meme regle que assertOrderFeaturesAllowed et PLAN_LIMITS:
--   - livraison, service en chambre: Business et plus;
--   - pourboire > 0, devise d'affichage differente de celle du restaurant:
--     Pro et plus.
-- INSERT, et UPDATE quand l'une de ces colonnes CHANGE (une commande ancienne
-- n'est pas bloquee pour une autre modification). Pour le pourboire, seule une
-- HAUSSE est refusee (accord avec le lot pourboires, PR #446, qui a retire son
-- propre controle: un seul verrou).
--
-- SECURITY DEFINER, et c'est voulu: la regle depend du plan du restaurant, pas
-- du role de l'appelant (la lecon "garde = SECURITY INVOKER" vaut pour les
-- gardes qui lisent current_user). En DEFINER, le trigger lit tenants et
-- tenant_effective_plan quel que soit le RLS de l'appelant.
--
-- Additive et rejouable. Test: supabase/tests/rls/verrou_plan_commandes.test.sql.
-- Rollback:
--   drop trigger if exists trg_enforce_order_plan_features on public.orders;
--   drop function if exists public.enforce_order_plan_features();
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_order_plan_features()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan     text;
  v_currency text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.service_type IS NOT DISTINCT FROM OLD.service_type
     AND NEW.tip_amount IS NOT DISTINCT FROM OLD.tip_amount
     AND NEW.display_currency IS NOT DISTINCT FROM OLD.display_currency THEN
    RETURN NEW;
  END IF;

  v_plan := public.tenant_effective_plan(NEW.tenant_id);

  IF NEW.service_type IN ('delivery', 'room_service')
     AND (TG_OP = 'INSERT' OR NEW.service_type IS DISTINCT FROM OLD.service_type)
     AND v_plan NOT IN ('business', 'enterprise') THEN
    RAISE EXCEPTION 'Service type % requires the Business plan', NEW.service_type
      USING ERRCODE = 'check_violation';
  END IF;

  -- Pourboire: refuse a la creation des qu'il est positif (quel que soit le
  -- role, c'est le plan qui juge), et a la modification seulement s'il
  -- AUGMENTE. Une baisse (correction, annulation d'un encaissement) passe,
  -- meme si le plan a change entre-temps.
  IF COALESCE(NEW.tip_amount, 0) > 0
     AND (TG_OP = 'INSERT' OR COALESCE(NEW.tip_amount, 0) > COALESCE(OLD.tip_amount, 0))
     AND v_plan NOT IN ('pro', 'business', 'enterprise') THEN
    RAISE EXCEPTION 'Tips require the Pro plan or higher'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.display_currency IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.display_currency IS DISTINCT FROM OLD.display_currency)
     AND v_plan NOT IN ('pro', 'business', 'enterprise') THEN
    SELECT currency INTO v_currency FROM tenants WHERE id = NEW.tenant_id;
    IF NEW.display_currency IS DISTINCT FROM COALESCE(v_currency, 'XAF') THEN
      RAISE EXCEPTION 'Multi-currency requires the Pro plan or higher'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_plan_features ON public.orders;
CREATE TRIGGER trg_enforce_order_plan_features
  BEFORE INSERT OR UPDATE OF service_type, tip_amount, display_currency ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_order_plan_features();

REVOKE EXECUTE ON FUNCTION public.enforce_order_plan_features() FROM PUBLIC, anon, authenticated;
