-- P-05 : UN SEUL essai gratuit par proprietaire.
--
-- Application: psql -1 -v ON_ERROR_STOP=1 -f <ce fichier> (la migration porte
-- aussi son propre BEGIN/COMMIT: tout ou rien).
--
-- Constat. Chaque nouveau tenant demarrait un essai de 14 jours neuf
-- (provision_signup_tenant et provision_group_restaurant fixaient
-- `trial` + now() + 14 jours sans rien regarder). Un proprietaire pouvait donc
-- enchainer les essais en ajoutant un etablissement, ou en supprimant son
-- compte puis en se reinscrivant.
--
-- Regle appliquee, dans la base (valable pour l'inscription, l'ajout d'un
-- etablissement et tout futur appelant):
--   1. Premier essai de ce proprietaire: essai normal de 14 jours ('started').
--   2. Il a deja un essai EN COURS (autre etablissement, ou registre encore
--      valide apres suppression de son compte, sans etablissement): le nouvel
--      etablissement partage la MEME date de fin ('shared').
--   3. Sinon (essai fini, ou etablissement deja abonne): pas d'essai ('none').
--      Le tenant nait `frozen` / is_active=false / freeze_reason='trial_expired',
--      l'etat que le cron freeze-expired-trials donne a un essai expire. Le
--      proprietaire le debloque par le meme chemin (page d'abonnement puis
--      paiement Stripe). Aucune valeur de statut inventee.
--
-- Facturation: PAR TENANT (une souscription Stripe par tenant); maxVenues est
-- une limite d'espaces dans un tenant, pas par groupe. Un nouvel etablissement
-- d'un proprietaire deja abonne doit donc avoir sa propre souscription.
--
-- Registre `owner_trial_ledger`: cle = e-mail EXACT en minuscules lu dans
-- auth.users (jamais un parametre fourni par l'appelant). Une ligne ne COMPTE
-- (consomme l'essai) que si son compte a confirme son e-mail (confirmed_at non
-- nul). Un compte jamais confirme, meme supprime, ne bloque donc personne: le
-- vrai proprietaire de l'adresse reprend la ligne. Deux declencheurs sur
-- auth.users tiennent confirmed_at a jour (confirmation tardive, suppression
-- d'un compte confirme). Le registre n'a pas de cle etrangere: il survit a la
-- suppression du compte. Limite connue: un autre e-mail reste un autre
-- proprietaire (les alias +x et les points Gmail ne sont pas fusionnes).
--
-- Limites connues: (a) changer d'e-mail apres l'inscription contourne le registre
-- (la cle est celle de l'e-mail au moment de la decision); (b) decide_owner_trial
-- leve 'owner_without_email' (SQLSTATE 22023) si le compte n'a pas d'e-mail:
-- aucun essai n'est accorde dans ce cas, et la creation echoue.
--
-- ATTENTION donnees existantes (L6): le retro-remplissage marque l'e-mail de
-- CHAQUE proprietaire existant comme ayant deja consomme son essai (compte
-- confirme ou non au moment de la migration: seuls les comptes confirmes comptent).
--
-- RLS sans policy sur owner_trial_ledger: voulu. Seul service_role (qui contourne
-- la RLS) lit et ecrit cette table, via des fonctions SECURITY DEFINER. anon et
-- authenticated n'ont aucun droit ET aucune policy: deny total. Remise a zero
-- manuelle d'un proprietaire (geste de support), par psql en service_role:
--   delete from public.owner_trial_ledger where email_key = 'adresse@exemple.com';
--
-- Les fonctions ci-dessous sont REVOQUEES pour PUBLIC, anon et authenticated:
-- les privileges par defaut du schema public donnent EXECUTE a anon et
-- authenticated aux fonctions nouvelles (schema.sql, ALTER DEFAULT PRIVILEGES).
--
-- Rollback (executer dans l'ordre):
--   1. retablir les deux fonctions d'avant (corps exacts ci-dessous),
--   2. drop trigger tg_owner_trial_ledger_confirm_upd on auth.users;
--      drop trigger tg_owner_trial_ledger_confirm_del on auth.users;
--      drop function public.owner_trial_ledger_sync_confirmation();
--      drop function public.decide_owner_trial(uuid);
--      drop table public.owner_trial_ledger;
--
-- Corps d'avant de provision_signup_tenant (20260526120000):
-- CREATE OR REPLACE FUNCTION provision_signup_tenant(
--   p_slug text,
--   p_name text,
--   p_plan text,
--   p_user_id uuid,
--   p_email text,
--   p_full_name text,
--   p_phone text DEFAULT NULL
-- )
-- RETURNS jsonb
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- DECLARE
--   v_tenant_id uuid;
--   v_group_id uuid;
--   v_trial_ends timestamptz := now() + interval '14 days';
-- BEGIN
--   INSERT INTO tenants (
--     slug,
--     name,
--     subscription_plan,
--     subscription_status,
--     trial_ends_at,
--     is_active
--   ) VALUES (
--     p_slug,
--     p_name,
--     p_plan,
--     'trial',
--     v_trial_ends,
--     true
--   )
--   RETURNING id INTO v_tenant_id;
--
--   INSERT INTO restaurant_groups (owner_user_id, name)
--   VALUES (p_user_id, 'Mon Groupe')
--   ON CONFLICT (owner_user_id) DO UPDATE SET updated_at = now()
--   RETURNING id INTO v_group_id;
--
--   IF v_group_id IS NULL THEN
--     SELECT id INTO v_group_id FROM restaurant_groups WHERE owner_user_id = p_user_id;
--   END IF;
--
--   UPDATE tenants
--   SET group_id = v_group_id
--   WHERE id = v_tenant_id;
--
--   INSERT INTO admin_users (
--     tenant_id,
--     user_id,
--     email,
--     full_name,
--     phone,
--     role,
--     is_active
--   ) VALUES (
--     v_tenant_id,
--     p_user_id,
--     p_email,
--     p_full_name,
--     p_phone,
--     'owner',
--     true
--   );
--
--   INSERT INTO venues (tenant_id, slug, name, name_en, type, is_active)
--   VALUES (v_tenant_id, 'main', 'Salle principale', 'Main Dining', 'restaurant', true);
--
--   RETURN jsonb_build_object(
--     'tenantId', v_tenant_id,
--     'slug', p_slug,
--     'groupId', v_group_id
--   );
-- END;
-- $$;
--
-- REVOKE ALL ON FUNCTION provision_signup_tenant(text, text, text, uuid, text, text, text) FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION provision_signup_tenant(text, text, text, uuid, text, text, text) TO service_role;
--
-- Corps d'avant de provision_group_restaurant (20260629030000):
-- CREATE OR REPLACE FUNCTION provision_group_restaurant(
--   p_group_id uuid,
--   p_user_id uuid,
--   p_email text,
--   p_name text,
--   p_slug text,
--   p_type text,
--   p_plan text
-- )
-- RETURNS jsonb
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- DECLARE
--   v_tenant_id uuid;
--   v_owner uuid;
--   v_plan text := CASE WHEN p_plan = 'trial' THEN 'starter' ELSE p_plan END;
--   v_status text := CASE WHEN p_plan = 'trial' THEN 'trial' ELSE 'pending' END;
--   v_trial_ends timestamptz := CASE WHEN p_plan = 'trial' THEN now() + interval '14 days' ELSE NULL END;
-- BEGIN
--   -- Defense in depth: the group must belong to the caller's user.
--   SELECT owner_user_id INTO v_owner FROM restaurant_groups WHERE id = p_group_id;
--   IF v_owner IS NULL OR v_owner <> p_user_id THEN
--     RAISE EXCEPTION 'group_not_owned_by_user' USING ERRCODE = '42501';
--   END IF;
--
--   INSERT INTO tenants (
--     slug,
--     name,
--     group_id,
--     subscription_plan,
--     subscription_status,
--     trial_ends_at,
--     is_active
--   ) VALUES (
--     p_slug,
--     p_name,
--     p_group_id,
--     v_plan,
--     v_status,
--     v_trial_ends,
--     true
--   )
--   RETURNING id INTO v_tenant_id;
--
--   INSERT INTO admin_users (
--     tenant_id,
--     user_id,
--     email,
--     full_name,
--     role,
--     is_active
--   ) VALUES (
--     v_tenant_id,
--     p_user_id,
--     p_email,
--     p_name,
--     'owner',
--     true
--   );
--
--   INSERT INTO venues (tenant_id, slug, name, name_en, type, is_active)
--   VALUES (v_tenant_id, 'main', 'Salle principale', 'Main Dining', p_type, true);
--
--   RETURN jsonb_build_object(
--     'tenantId', v_tenant_id,
--     'slug', p_slug
--   );
-- END;
-- $$;
--
-- REVOKE ALL ON FUNCTION provision_group_restaurant(uuid, uuid, text, text, text, text, text) FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION provision_group_restaurant(uuid, uuid, text, text, text, text, text) TO service_role;

BEGIN;

-- 1. Registre des essais consommes (service_role uniquement).
DROP FUNCTION IF EXISTS public.decide_owner_trial(uuid, text);
DROP FUNCTION IF EXISTS public.normalize_owner_email(text);

CREATE TABLE IF NOT EXISTS public.owner_trial_ledger (
  email_key text PRIMARY KEY,
  first_user_id uuid,
  first_trial_at timestamptz NOT NULL DEFAULT now(),
  trial_ends_at timestamptz NOT NULL,
  confirmed_at timestamptz
);

ALTER TABLE public.owner_trial_ledger ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

COMMENT ON TABLE public.owner_trial_ledger IS
  'Un essai gratuit par proprietaire. Cle = e-mail exact en minuscules (auth.users). Ne compte que si confirmed_at est non nul. Sans FK vers auth.users pour survivre a la suppression du compte. service_role uniquement.';

ALTER TABLE public.owner_trial_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_trial_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.owner_trial_ledger TO service_role;

-- 2. Decision unique, partagee par les deux fonctions de provisionnement.
--    La cle vient de auth.users: aucun parametre d'adresse n'est accepte.
--    mode: 'started' (premier essai), 'shared' (fin partagee), 'none' (pas d'essai).
CREATE OR REPLACE FUNCTION public.decide_owner_trial(p_user_id uuid)
RETURNS TABLE (mode text, trial_ends timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_confirmed boolean;
  v_running timestamptz;
  v_seen boolean;
  v_l_end timestamptz;
  v_l_confirmed timestamptz;
  v_new_end timestamptz := now() + interval '14 days';
BEGIN
  SELECT lower(btrim(u.email)), u.email_confirmed_at IS NOT NULL
    INTO v_key, v_confirmed
    FROM auth.users u
   WHERE u.id = p_user_id;

  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'owner_without_email' USING ERRCODE = '22023';
  END IF;

  -- Serialise les creations simultanees du meme proprietaire.
  PERFORM pg_advisory_xact_lock(hashtext('owner_trial:' || v_key));

  SELECT l.trial_ends_at, l.confirmed_at
    INTO v_l_end, v_l_confirmed
    FROM owner_trial_ledger l
   WHERE l.email_key = v_key;

  -- Une confirmation survenue depuis la derniere decision est enregistree.
  IF v_confirmed THEN
    UPDATE owner_trial_ledger
       SET confirmed_at = now()
     WHERE email_key = v_key AND first_user_id = p_user_id AND confirmed_at IS NULL;
    IF FOUND THEN v_l_confirmed := now(); END IF;
  END IF;

  SELECT max(t.trial_ends_at)
    INTO v_running
    FROM tenants t
    JOIN restaurant_groups g ON g.id = t.group_id
   WHERE g.owner_user_id = p_user_id
     AND t.subscription_status = 'trial'
     AND t.trial_ends_at > now();

  IF v_running IS NOT NULL THEN
    RETURN QUERY SELECT 'shared'::text, v_running;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM tenants t
      JOIN restaurant_groups g ON g.id = t.group_id
     WHERE g.owner_user_id = p_user_id
  ) INTO v_seen;

  IF v_seen THEN
    RETURN QUERY SELECT 'none'::text, coalesce(v_l_end, now());
    RETURN;
  END IF;

  -- Aucun etablissement. Une ligne confirmee d'un compte precedent fait foi.
  IF v_l_end IS NOT NULL AND v_l_confirmed IS NOT NULL THEN
    IF v_l_end > now() THEN
      RETURN QUERY SELECT 'shared'::text, v_l_end;
    ELSE
      RETURN QUERY SELECT 'none'::text, v_l_end;
    END IF;
    RETURN;
  END IF;

  -- Pas de ligne, ou ligne jamais confirmee (squatteur): le vrai proprietaire la reprend.
  INSERT INTO owner_trial_ledger (email_key, first_user_id, first_trial_at, trial_ends_at, confirmed_at)
  VALUES (v_key, p_user_id, now(), v_new_end, CASE WHEN v_confirmed THEN now() END)
  ON CONFLICT (email_key) DO UPDATE
    SET first_user_id = EXCLUDED.first_user_id,
        first_trial_at = EXCLUDED.first_trial_at,
        trial_ends_at = EXCLUDED.trial_ends_at,
        confirmed_at = EXCLUDED.confirmed_at;
  RETURN QUERY SELECT 'started'::text, v_new_end;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_owner_trial(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_owner_trial(uuid) TO service_role;

-- 3. Tient confirmed_at a jour: confirmation tardive, ou suppression d'un compte confirme.
CREATE OR REPLACE FUNCTION public.owner_trial_ledger_sync_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row auth.users;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  -- Ce declencheur est greffe sur auth.users: il ne doit JAMAIS faire echouer
  -- une confirmation ou une suppression de compte (GoTrue). Toute erreur est
  -- journalisee en avertissement et la ligne d'origine est toujours rendue.
  BEGIN
    IF v_row.email_confirmed_at IS NOT NULL AND v_row.email IS NOT NULL THEN
      UPDATE public.owner_trial_ledger
         SET confirmed_at = now()
       WHERE email_key = lower(btrim(v_row.email))
         AND first_user_id = v_row.id
         AND confirmed_at IS NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'owner_trial_ledger_sync: %', SQLERRM;
  END;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_trial_ledger_sync_confirmation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tg_owner_trial_ledger_confirm_upd ON auth.users;
CREATE TRIGGER tg_owner_trial_ledger_confirm_upd
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.owner_trial_ledger_sync_confirmation();

DROP TRIGGER IF EXISTS tg_owner_trial_ledger_confirm_del ON auth.users;
CREATE TRIGGER tg_owner_trial_ledger_confirm_del
  BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.owner_trial_ledger_sync_confirmation();

-- 4. Retro-remplissage: les proprietaires deja connus ont consomme leur essai.
--    confirmed_at suit l'etat reel du compte au moment de la migration.
INSERT INTO public.owner_trial_ledger (email_key, first_user_id, first_trial_at, trial_ends_at, confirmed_at)
SELECT lower(btrim(u.email)),
       (array_agg(u.id ORDER BY t.created_at))[1],
       min(t.created_at),
       min(t.created_at) + interval '14 days',
       CASE WHEN bool_or(u.email_confirmed_at IS NOT NULL) THEN now() END
  FROM admin_users au
  JOIN auth.users u ON u.id = au.user_id
  JOIN tenants t ON t.id = au.tenant_id
 WHERE au.role = 'owner'
   AND coalesce(u.email, '') <> ''
 GROUP BY lower(btrim(u.email))
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
  SELECT d.mode, d.trial_ends INTO v_mode, v_trial_ends FROM decide_owner_trial(p_user_id) d;

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

REVOKE ALL ON FUNCTION provision_signup_tenant(text, text, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION provision_signup_tenant(text, text, text, uuid, text, text, text) TO service_role;

-- 6. provision_group_restaurant: l'essai n'est plus accorde sur simple demande.
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

  SELECT d.mode, d.trial_ends INTO v_mode, v_trial_ends FROM decide_owner_trial(p_user_id) d;

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

REVOKE ALL ON FUNCTION provision_group_restaurant(uuid, uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION provision_group_restaurant(uuid, uuid, text, text, text, text, text) TO service_role;

COMMIT;
