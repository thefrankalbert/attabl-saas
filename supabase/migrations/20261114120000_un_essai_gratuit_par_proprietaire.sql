-- P-05 : UN SEUL essai gratuit par proprietaire.
--
-- Constat. Chaque nouveau tenant demarrait un essai de 14 jours neuf
-- (provision_signup_tenant et provision_group_restaurant fixaient
-- `trial` + now() + 14 jours sans rien regarder). Un proprietaire pouvait donc
-- enchainer les essais en ajoutant un etablissement, ou en supprimant son
-- compte puis en se reinscrivant.
--
-- Regle appliquee, dans la base (donc valable pour l'inscription, l'ajout d'un
-- etablissement et tout futur appelant, sans toucher au code protege):
--   1. Premier essai de ce proprietaire (aucune trace): essai normal de 14 jours.
--   2. Il a deja un essai EN COURS (autre etablissement, statut trial, fin dans
--      le futur): le nouvel etablissement partage la MEME date de fin.
--   3. Sinon (essai deja consomme et fini, ou etablissement deja abonne): pas
--      d'essai. Le tenant nait `frozen` / is_active=false / freeze_reason=
--      'trial_expired', exactement l'etat que le cron freeze-expired-trials
--      donne a un essai expire. Le proprietaire le debloque par le meme chemin
--      qu'un essai expire: la page d'abonnement puis le paiement Stripe
--      (checkout.session.completed remet le statut, is_active et efface la cause).
--      Aucune valeur de statut inventee: 'frozen' est dans tenants_subscription_status_check
--      et tenants_gel_implique_inactif impose is_active=false.
--
-- Facturation d'un etablissement supplementaire d'un proprietaire deja abonne:
-- la facturation est PAR TENANT (une souscription Stripe par tenant,
-- resolveCheckoutTenant) et maxVenues est une limite d'ESPACES a l'interieur
-- d'un tenant, pas par groupe. Un nouvel etablissement est donc un nouveau
-- tenant qui doit avoir sa propre souscription: pas d'essai offert, meme logique.
--
-- Suppression puis recreation du compte: le registre `owner_trial_ledger` est
-- cle sur l'e-mail normalise (minuscules, suffixe +alias retire), sans cle
-- etrangere vers auth.users, donc il survit a la suppression du compte. Limite
-- connue: un e-mail entierement different reste un nouveau proprietaire.
--
-- Rollback (ordre):
--   -- 1. Remettre les deux fonctions d'avant: rejouer
--   --    20260526120000_ensure_restaurant_groups_for_signup.sql (provision_signup_tenant)
--   --    et 20260629030000_atomic_add_restaurant_rpc.sql (provision_group_restaurant).
--   -- 2. drop function if exists public.decide_owner_trial(uuid, text);
--   --    drop function if exists public.normalize_owner_email(text);
--   --    drop table if exists public.owner_trial_ledger;

-- 1. Registre des essais consommes (service_role uniquement).
CREATE TABLE IF NOT EXISTS public.owner_trial_ledger (
  email_key text PRIMARY KEY,
  first_user_id uuid,
  first_trial_at timestamptz NOT NULL DEFAULT now(),
  trial_ends_at timestamptz NOT NULL
);

COMMENT ON TABLE public.owner_trial_ledger IS
  'Un essai gratuit par proprietaire. Cle = e-mail normalise, sans FK vers auth.users pour survivre a la suppression du compte. service_role uniquement.';

ALTER TABLE public.owner_trial_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_trial_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.owner_trial_ledger TO service_role;

-- 2. Normalisation de l'e-mail: minuscules, espaces retires, suffixe +alias retire.
CREATE OR REPLACE FUNCTION public.normalize_owner_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(lower(btrim(coalesce(p_email, ''))), '\+[^@]*@', '@');
$$;

REVOKE ALL ON FUNCTION public.normalize_owner_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_owner_email(text) TO service_role;

-- 3. Decision unique, partagee par les deux fonctions de provisionnement.
--    mode: 'started' (premier essai), 'shared' (fin partagee), 'none' (pas d'essai).
CREATE OR REPLACE FUNCTION public.decide_owner_trial(p_user_id uuid, p_email text)
RETURNS TABLE (mode text, trial_ends timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := public.normalize_owner_email(p_email);
  v_running timestamptz;
  v_seen boolean;
  v_ledger_end timestamptz;
BEGIN
  -- Serialise les creations simultanees du meme proprietaire.
  PERFORM pg_advisory_xact_lock(hashtext('owner_trial:' || v_key));

  SELECT max(t.trial_ends_at)
    INTO v_running
    FROM tenants t
    JOIN restaurant_groups g ON g.id = t.group_id
   WHERE g.owner_user_id = p_user_id
     AND t.subscription_status = 'trial'
     AND t.trial_ends_at > now();

  IF v_running IS NOT NULL THEN
    INSERT INTO owner_trial_ledger (email_key, first_user_id, trial_ends_at)
    VALUES (v_key, p_user_id, v_running)
    ON CONFLICT (email_key) DO NOTHING;
    RETURN QUERY SELECT 'shared'::text, v_running;
    RETURN;
  END IF;

  SELECT l.trial_ends_at INTO v_ledger_end FROM owner_trial_ledger l WHERE l.email_key = v_key;

  SELECT EXISTS (
    SELECT 1
      FROM tenants t
      JOIN restaurant_groups g ON g.id = t.group_id
     WHERE g.owner_user_id = p_user_id
  ) INTO v_seen;

  IF v_ledger_end IS NOT NULL OR v_seen THEN
    RETURN QUERY SELECT 'none'::text, coalesce(v_ledger_end, now());
    RETURN;
  END IF;

  INSERT INTO owner_trial_ledger (email_key, first_user_id, trial_ends_at)
  VALUES (v_key, p_user_id, now() + interval '14 days');
  RETURN QUERY SELECT 'started'::text, now() + interval '14 days';
END;
$$;

REVOKE ALL ON FUNCTION public.decide_owner_trial(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_owner_trial(uuid, text) TO service_role;

-- 4. Retro-remplissage: les proprietaires deja connus ont consomme leur essai.
INSERT INTO public.owner_trial_ledger (email_key, first_user_id, first_trial_at, trial_ends_at)
SELECT public.normalize_owner_email(au.email),
       (array_agg(au.user_id ORDER BY t.created_at))[1],
       min(t.created_at),
       min(t.created_at) + interval '14 days'
  FROM admin_users au
  JOIN tenants t ON t.id = au.tenant_id
 WHERE au.role = 'owner'
   AND coalesce(au.email, '') <> ''
 GROUP BY public.normalize_owner_email(au.email)
ON CONFLICT (email_key) DO NOTHING;

-- 5. provision_signup_tenant: meme corps qu'avant, statut/essai decides.
CREATE OR REPLACE FUNCTION provision_signup_tenant(
  p_slug text,
  p_name text,
  p_plan text,
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_group_id uuid;
  v_mode text;
  v_trial_ends timestamptz;
BEGIN
  SELECT d.mode, d.trial_ends INTO v_mode, v_trial_ends FROM decide_owner_trial(p_user_id, p_email) d;

  INSERT INTO tenants (
    slug, name, subscription_plan, subscription_status, trial_ends_at, is_active, freeze_reason
  ) VALUES (
    p_slug,
    p_name,
    p_plan,
    CASE WHEN v_mode = 'none' THEN 'frozen' ELSE 'trial' END,
    v_trial_ends,
    v_mode <> 'none',
    CASE WHEN v_mode = 'none' THEN 'trial_expired' ELSE NULL END
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO restaurant_groups (owner_user_id, name)
  VALUES (p_user_id, 'Mon Groupe')
  ON CONFLICT (owner_user_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_group_id;

  IF v_group_id IS NULL THEN
    SELECT id INTO v_group_id FROM restaurant_groups WHERE owner_user_id = p_user_id;
  END IF;

  UPDATE tenants SET group_id = v_group_id WHERE id = v_tenant_id;

  INSERT INTO admin_users (tenant_id, user_id, email, full_name, phone, role, is_active)
  VALUES (v_tenant_id, p_user_id, p_email, p_full_name, p_phone, 'owner', true);

  INSERT INTO venues (tenant_id, slug, name, name_en, type, is_active)
  VALUES (v_tenant_id, 'main', 'Salle principale', 'Main Dining', 'restaurant', true);

  RETURN jsonb_build_object(
    'tenantId', v_tenant_id,
    'slug', p_slug,
    'groupId', v_group_id,
    'trialMode', v_mode
  );
END;
$$;

REVOKE ALL ON FUNCTION provision_signup_tenant(text, text, text, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION provision_signup_tenant(text, text, text, uuid, text, text, text) TO service_role;

-- 6. provision_group_restaurant: l'essai n'est plus accorde sur simple demande.
--    Le plan 'trial' demande a toujours la meme valeur de plan (starter) qu'avant;
--    seul le statut et la date de fin dependent maintenant de decide_owner_trial.
CREATE OR REPLACE FUNCTION provision_group_restaurant(
  p_group_id uuid,
  p_user_id uuid,
  p_email text,
  p_name text,
  p_slug text,
  p_type text,
  p_plan text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_owner uuid;
  v_plan text := CASE WHEN p_plan = 'trial' THEN 'starter' ELSE p_plan END;
  v_mode text;
  v_trial_ends timestamptz;
BEGIN
  SELECT owner_user_id INTO v_owner FROM restaurant_groups WHERE id = p_group_id;
  IF v_owner IS NULL OR v_owner <> p_user_id THEN
    RAISE EXCEPTION 'group_not_owned_by_user' USING ERRCODE = '42501';
  END IF;

  SELECT d.mode, d.trial_ends INTO v_mode, v_trial_ends FROM decide_owner_trial(p_user_id, p_email) d;

  INSERT INTO tenants (
    slug, name, group_id, subscription_plan, subscription_status, trial_ends_at, is_active, freeze_reason
  ) VALUES (
    p_slug,
    p_name,
    p_group_id,
    v_plan,
    CASE WHEN v_mode = 'none' THEN 'frozen' ELSE 'trial' END,
    v_trial_ends,
    v_mode <> 'none',
    CASE WHEN v_mode = 'none' THEN 'trial_expired' ELSE NULL END
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO admin_users (tenant_id, user_id, email, full_name, role, is_active)
  VALUES (v_tenant_id, p_user_id, p_email, p_name, 'owner', true);

  INSERT INTO venues (tenant_id, slug, name, name_en, type, is_active)
  VALUES (v_tenant_id, 'main', 'Salle principale', 'Main Dining', p_type, true);

  RETURN jsonb_build_object('tenantId', v_tenant_id, 'slug', p_slug, 'trialMode', v_mode);
END;
$$;

REVOKE ALL ON FUNCTION provision_group_restaurant(uuid, uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION provision_group_restaurant(uuid, uuid, text, text, text, text, text) TO service_role;
