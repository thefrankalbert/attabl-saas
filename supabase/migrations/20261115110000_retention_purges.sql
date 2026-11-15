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
-- 3. audit_personal_keys(): liste unique des cles JSON personnelles retirees des
--    journaux d'audit.
-- 4. purge_audit_logs(p_cutoff): au dela de la date limite, SUPPRIME les entrees
--    d'audit non financieres et PSEUDONYMISE les entrees financieres (commande,
--    coupon, article: prix) - identite de l'acteur effacee, cles personnelles du
--    JSON retirees, ligne conservee pour la tracabilite comptable.
-- 5. closed_tenant_auth_users(p_cutoff): comptes d'authentification a effacer
--    (membres des restaurants clos avant p_cutoff, sans autre appartenance vivante
--    et qui ne sont super administrateur sur AUCUNE ligne). Lecture seule.
-- 6. anonymize_closed_tenants(p_cutoff): anonymise en une transaction les membres,
--    les comptes clients a credit (nom, description), les contacts fournisseurs,
--    les journaux d'audit du restaurant et de la plateforme, les annotations de commande, supprime invitations,
--    abonnements push et sessions, vide telephone et adresse du restaurant.
--    Les commandes, paiements et factures ne sont PAS touches.
--
-- Les fonctions sont appelees uniquement par le cron (client service_role). Les deux
-- fonctions de restaurants clos recoivent la MEME date limite, pour que l'etape
-- d'authentification et l'etape base de donnees portent sur le meme ensemble.
--
-- Ordre de mise en production: cette migration d'abord (additive), puis le code.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.anonymize_closed_tenants(timestamptz);
--   DROP FUNCTION IF EXISTS public.closed_tenant_auth_users(timestamptz);
--   DROP FUNCTION IF EXISTS public.purge_audit_logs(timestamptz);
--   DROP FUNCTION IF EXISTS public.audit_personal_keys();
--   ALTER TABLE public.tenants DROP COLUMN IF EXISTS anonymized_at;
--   ALTER TABLE public.push_subscriptions DROP COLUMN IF EXISTS last_used_at;

BEGIN;

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_last_used
  ON public.push_subscriptions (last_used_at);

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;

CREATE OR REPLACE FUNCTION public.audit_personal_keys()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY[
    'customer_name', 'customer_phone', 'delivery_address', 'notes',
    'customer_notes', 'email', 'user_email', 'phone', 'full_name',
    'contact_name', 'address', 'emailChangeRequestedTo', 'reason'
  ];
$$;

CREATE OR REPLACE FUNCTION public.purge_audit_logs(p_cutoff timestamptz)
RETURNS TABLE (deleted_count integer, pseudonymized_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted integer;
  v_pseudo integer;
BEGIN
  DELETE FROM public.audit_log
  WHERE created_at < p_cutoff
    AND entity_type NOT IN ('order', 'coupon', 'item');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  UPDATE public.audit_log
  SET user_email = NULL,
      user_id = NULL,
      old_data = old_data - public.audit_personal_keys(),
      new_data = new_data - public.audit_personal_keys(),
      metadata = metadata - public.audit_personal_keys()
  WHERE created_at < p_cutoff
    AND entity_type IN ('order', 'coupon', 'item')
    AND (user_email IS NOT NULL
         OR user_id IS NOT NULL
         OR old_data ?| public.audit_personal_keys()
         OR new_data ?| public.audit_personal_keys()
         OR metadata ?| public.audit_personal_keys());
  GET DIAGNOSTICS v_pseudo = ROW_COUNT;

  RETURN QUERY SELECT v_deleted, v_pseudo;
END;
$$;

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
    AND NOT EXISTS (
      SELECT 1
      FROM public.admin_users sa
      WHERE sa.user_id = au.user_id
        AND (sa.is_super_admin IS TRUE OR sa.role = 'super_admin')
    )
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

  UPDATE public.admin_users au
  SET email = 'anonymise-' || au.id::text || '@anonymise.invalid',
      full_name = NULL,
      phone = NULL,
      ban_reason = NULL,
      is_active = false
  WHERE au.tenant_id = ANY (v_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM public.admin_users sa
      WHERE sa.user_id = au.user_id
        AND (sa.is_super_admin IS TRUE OR sa.role = 'super_admin')
    );

  -- Comptes clients a credit: le nom (NOT NULL) et la description identifient des
  -- convives. Le lien avec les commandes se fait par id: les soldes et le registre
  -- des paiements ne sont pas touches.
  UPDATE public.house_accounts
  SET name = 'Compte anonymise',
      description = NULL
  WHERE tenant_id = ANY (v_ids);

  UPDATE public.suppliers
  SET contact_name = NULL,
      phone = NULL,
      email = NULL,
      address = NULL,
      notes = NULL
  WHERE tenant_id = ANY (v_ids);

  DELETE FROM public.invitations WHERE tenant_id = ANY (v_ids);
  DELETE FROM public.push_subscriptions WHERE tenant_id = ANY (v_ids);
  DELETE FROM public.user_sessions WHERE tenant_id = ANY (v_ids);

  -- Entrees non financieres: tout le contenu part (la ligne reste, sans charge).
  UPDATE public.audit_log
  SET user_email = NULL,
      user_id = NULL,
      old_data = NULL,
      new_data = NULL,
      metadata = NULL
  WHERE tenant_id = ANY (v_ids)
    AND entity_type NOT IN ('order', 'coupon', 'item');

  -- Entrees financieres: les montants restent, les cles personnelles partent.
  UPDATE public.audit_log
  SET user_email = NULL,
      user_id = NULL,
      old_data = old_data - public.audit_personal_keys(),
      new_data = new_data - public.audit_personal_keys(),
      metadata = metadata - public.audit_personal_keys()
  WHERE tenant_id = ANY (v_ids)
    AND entity_type IN ('order', 'coupon', 'item');

  -- Annotations des managers sur les commandes (texte libre, ajout seul): le texte
  -- est remplace, la ligne (qui, quand) est gardee.
  UPDATE public.order_notes
  SET note = 'Note effacee'
  WHERE tenant_id = ANY (v_ids)
    AND note <> 'Note effacee';

  UPDATE public.platform_audit_log
  SET actor_email = NULL,
      target_label = NULL,
      reason = NULL,
      metadata = NULL
  WHERE tenant_id = ANY (v_ids);

  UPDATE public.tenants
  SET phone = NULL,
      address = NULL,
      anonymized_at = now()
  WHERE id = ANY (v_ids);

  RETURN array_length(v_ids, 1);
END;
$$;

REVOKE ALL ON FUNCTION public.audit_personal_keys() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_personal_keys() TO service_role;

REVOKE ALL ON FUNCTION public.purge_audit_logs(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_audit_logs(timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.closed_tenant_auth_users(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.closed_tenant_auth_users(timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.anonymize_closed_tenants(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_closed_tenants(timestamptz) TO service_role;

COMMIT;
