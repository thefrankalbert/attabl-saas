-- A-08 (contre-audit PR #411): la pre-verification du nom de restaurant a
-- l'inscription doit appliquer EXACTEMENT le predicat du declencheur
-- enforce_tenant_name_cross_group_unique (migration 20260629020000): nom compare
-- par lower(btrim(...)), restaurants supprimes ignores, seuls les restaurants
-- ETABLIS (onboarding termine, rattaches a un groupe) reservent un nom. Une copie
-- approximative cote application (ILIKE) divergeait du declencheur.
--
-- A l'inscription il n'y a pas encore de groupe: la clause "autre groupe" du
-- declencheur est vraie pour tout restaurant etabli, donc elle n'apparait pas ici.
--
-- SECURITY DEFINER car le RLS cache les restaurants des autres comptes; appelee
-- uniquement par le client service_role (src/services/restaurant-name.service.ts).
-- Rollback: DROP FUNCTION public.is_tenant_name_taken(text);

BEGIN;

CREATE OR REPLACE FUNCTION public.is_tenant_name_taken(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.deleted_at IS NULL
      AND t.onboarding_completed = true
      AND t.group_id IS NOT NULL
      AND lower(btrim(t.name)) = lower(btrim(p_name))
  );
$$;

REVOKE ALL ON FUNCTION public.is_tenant_name_taken(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_name_taken(text) TO service_role;

COMMIT;
