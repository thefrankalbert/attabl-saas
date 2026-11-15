-- Conservation des donnees personnelles: ce qui manquait pour tenir les durees
-- annoncees dans la politique de confidentialite.
--
-- 1. push_subscriptions.last_used_at: sans date de derniere utilisation, impossible
--    de distinguer un appareil encore actif d'un appareil abandonne. `created_at`
--    ne convient pas: il supprimerait l'abonnement d'un membre actif inscrit il y
--    a plus de 180 jours. La colonne est rafraichie par l'application a chaque
--    (re)abonnement et a chaque envoi reussi. Les lignes existantes partent de now().
-- 2. tenants.anonymized_at: date a laquelle les donnees personnelles d'un
--    restaurant clos ont ete anonymisees. Sert de garde (la restauration d'un
--    restaurant anonymise est refusee) et d'idempotence. Aucun GRANT
--    anon/authenticated: la colonne n'est lisible que par service_role.
-- 3. closed_tenant_auth_users(p_cutoff): comptes d'authentification dont l'adresse
--    doit etre effacee (membres des restaurants clos avant p_cutoff qui n'ont
--    aucune autre appartenance vivante). Lecture seule.
-- 4. anonymize_closed_tenants(p_cutoff): anonymise en une transaction les membres,
--    anonymise les comptes clients a credit (nom, description), supprime
--    invitations, abonnements push et sessions, efface l'adresse des
--    journaux d'audit du restaurant, vide telephone et adresse du restaurant.
--    Les commandes, paiements et factures ne sont PAS touches.
--
-- Les deux fonctions sont appelees uniquement par le cron (client service_role) et
-- recoivent la MEME date limite, pour que l'etape d'authentification et l'etape
-- base de donnees portent sur le meme ensemble de restaurants.
--
-- Ordre de mise en production: cette migration d'abord (additive), puis le code.
-- Le code tolere l'absence de la colonne last_used_at (il journalise l'erreur et
-- n'interrompt aucune autre purge).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.anonymize_closed_tenants(timestamptz);
--   DROP FUNCTION IF EXISTS public.closed_tenant_auth_users(timestamptz);
--   ALTER TABLE public.tenants DROP COLUMN IF EXISTS anonymized_at;
--   ALTER TABLE public.push_subscriptions DROP COLUMN IF EXISTS last_used_at;

BEGIN;

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_last_used
  ON public.push_subscriptions (last_used_at);

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;

CREATE OR REPLACE FUNCTION public.closed_tenant_auth_users(p_cutoff timestamptz)
RETURNS TABLE (auth_user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT au.user_id
  FROM public.admin_users au
  JOIN public.tenants t ON t.id = au.tenant_id
  WHERE t.deleted_at IS NOT NULL
    AND t.deleted_at < p_cutoff
    AND t.anonymized_at IS NULL
    AND au.is_super_admin IS NOT TRUE
    AND au.role <> 'super_admin'
    AND NOT EXISTS (
      SELECT 1
      FROM public.admin_users other
      JOIN public.tenants ot ON ot.id = other.tenant_id
      WHERE other.user_id = au.user_id
        AND ot.anonymized_at IS NULL
        AND NOT (ot.deleted_at IS NOT NULL AND ot.deleted_at < p_cutoff)
    );
$$;

CREATE OR REPLACE FUNCTION public.anonymize_closed_tenants(p_cutoff timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(t.id) INTO v_ids
  FROM public.tenants t
  WHERE t.deleted_at IS NOT NULL
    AND t.deleted_at < p_cutoff
    AND t.anonymized_at IS NULL;

  IF v_ids IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.admin_users
  SET email = 'anonymise-' || id::text || '@anonymise.invalid',
      full_name = NULL,
      phone = NULL,
      ban_reason = NULL,
      is_active = false
  WHERE tenant_id = ANY (v_ids)
    AND is_super_admin IS NOT TRUE
    AND role <> 'super_admin';

  -- Comptes clients a credit: le nom (NOT NULL) et la description identifient des
  -- convives. Le lien avec les commandes se fait par id: les soldes et le registre
  -- des paiements ne sont pas touches.
  UPDATE public.house_accounts
  SET name = 'Compte anonymise',
      description = NULL
  WHERE tenant_id = ANY (v_ids);

  DELETE FROM public.invitations WHERE tenant_id = ANY (v_ids);
  DELETE FROM public.push_subscriptions WHERE tenant_id = ANY (v_ids);
  DELETE FROM public.user_sessions WHERE tenant_id = ANY (v_ids);

  UPDATE public.audit_log
  SET user_email = NULL
  WHERE tenant_id = ANY (v_ids)
    AND user_email IS NOT NULL;

  UPDATE public.tenants
  SET phone = NULL,
      address = NULL,
      anonymized_at = now()
  WHERE id = ANY (v_ids);

  RETURN array_length(v_ids, 1);
END;
$$;

REVOKE ALL ON FUNCTION public.closed_tenant_auth_users(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.closed_tenant_auth_users(timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.anonymize_closed_tenants(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_closed_tenants(timestamptz) TO service_role;

COMMIT;
