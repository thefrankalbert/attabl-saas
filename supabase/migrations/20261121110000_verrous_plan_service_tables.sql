-- Verrous de plan en base: assignation des serveurs et gestion des tables
-- ============================================================================
-- Audit "chaque plan respecte strictement ses fonctionnalites" (2026-11-20).
-- "Assignation serveurs" et "Gestion des tables" sont vendues a partir de Pro.
-- Les pages et les actions serveur les fermaient, mais les policies RLS de
-- table_assignments, tables et zones autorisent TOUT membre du tenant, sans
-- regarder le plan: un membre d'un restaurant Starter pouvait ecrire
-- directement dans PostgREST (/rest/v1/table_assignments) avec la cle anon.
-- Meme classe de trou que l'Inventaire (20260808000100): contournement de
-- paywall dans le meme tenant, pas une fuite entre tenants.
--
-- Perimetre: INSERT seulement, comme pour l'Inventaire. Liberer une
-- assignation, renommer ou desactiver une table existante restent permis:
-- un restaurant retrograde doit pouvoir faire le menage et continuer a servir.
--
-- Tables et zones: l'onboarding cree les tables de TOUS les plans (la carte QR
-- par table est incluse partout). La creation reste donc ouverte tant que
-- l'onboarding n'est pas termine (onboarding_completed est pose en DERNIER,
-- cf. src/services/onboarding.complete.ts). Ensuite, ajouter des tables ou des
-- zones demande Pro ou plus.
--
-- S'appuie sur public.tenant_effective_plan (20261121100000).
-- Additive et rejouable. Rollback:
--   drop trigger if exists trg_enforce_service_entitlement on public.table_assignments;
--   drop trigger if exists trg_enforce_tables_entitlement on public.tables;
--   drop trigger if exists trg_enforce_tables_entitlement on public.zones;
--   drop function if exists public.enforce_service_entitlement();
--   drop function if exists public.enforce_tables_entitlement();
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_service_entitlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.tenant_effective_plan(NEW.tenant_id) NOT IN ('pro', 'business', 'enterprise') THEN
    RAISE EXCEPTION 'Server assignment requires the Pro plan or higher'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_service_entitlement ON public.table_assignments;
CREATE TRIGGER trg_enforce_service_entitlement
  BEFORE INSERT ON public.table_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_service_entitlement();

CREATE OR REPLACE FUNCTION public.enforce_tables_entitlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Onboarding en cours: les tables de depart sont incluses dans tous les plans.
  IF EXISTS (
    SELECT 1 FROM tenants
    WHERE id = NEW.tenant_id AND COALESCE(onboarding_completed, false) = false
  ) THEN
    RETURN NEW;
  END IF;

  IF public.tenant_effective_plan(NEW.tenant_id) NOT IN ('pro', 'business', 'enterprise') THEN
    RAISE EXCEPTION 'Table management requires the Pro plan or higher'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tables_entitlement ON public.tables;
CREATE TRIGGER trg_enforce_tables_entitlement
  BEFORE INSERT ON public.tables
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_tables_entitlement();

DROP TRIGGER IF EXISTS trg_enforce_tables_entitlement ON public.zones;
CREATE TRIGGER trg_enforce_tables_entitlement
  BEFORE INSERT ON public.zones
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_tables_entitlement();

REVOKE EXECUTE ON FUNCTION public.enforce_service_entitlement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_tables_entitlement() FROM PUBLIC, anon, authenticated;
