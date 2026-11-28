-- ===========================================================================
-- MIGRATION DIFFEREE (fin du lot 4). NE PAS DEPLACER dans supabase/migrations/
-- avant que ses prealables soient tous remplis. Ce dossier
-- (supabase/migrations-differees/) n'est lu par AUCUN outil. Le nom du fichier
-- ne porte volontairement pas d'horodatage : il recoit le sien le jour ou il
-- est deplace.
-- ===========================================================================
--
-- Lot 1 des roles du personnel, MIG5 : retrait du role `admin` et des colonnes
-- `admin_users.role` et `invitations.role` (conception E.1).
--
-- POURQUOI. Depuis MIG1, `postes` est la verite et `role` n'est qu'une
-- projection maintenue pour l'ancien code et pour dix fonctions qui lisaient
-- encore `role`. Une fois ces lecteurs reecrits, la projection n'a plus de
-- raison d'etre : deux colonnes qui disent la meme chose finissent par diverger.
--
-- PREALABLES, tous requis.
--   1. MIG4 (contraction) appliquee.
--   2. Le code ne lit ni n'ecrit plus `role` : `rg -n "\brole\b" src scripts`
--      ne rend plus que le role PostgREST (`auth.role()`), l'attribut ARIA
--      `role=` et des libelles. En particulier `signup.service.ts` (fichier
--      PROTEGE, il ecrit encore `role: 'owner'` par provision_signup_tenant,
--      reecrite ici) et `scripts/manage-super-admin.js` (il filtre encore sur
--      `role = 'super_admin'`) sont modifies dans la MEME livraison, avec
--      l'accord explicite du proprietaire pour le fichier protege.
--   3. Les types generes et les tests pgTAP n'utilisent plus `role` : toute la
--      suite ecrit `postes`.
--   4. Sauvegarde, accord ecrit du proprietaire (suppression de colonnes).
--
-- CE QUE CE FICHIER FAIT.
--   - `is_super_admin = true` la ou `role = 'super_admin'` : la plateforme ne
--     repose plus que sur le drapeau.
--   - Reecrit les dix fonctions qui lisaient `role` et la politique "Block
--     super_admin escalation by non-super-admins".
--   - Remplace les declencheurs de synchronisation par un declencheur qui ne
--     fait plus que normaliser `postes` (ordre canonique, sans doublon). Ce
--     point n'est pas ecrit dans la conception, qui dit seulement "suppression
--     des declencheurs de synchronisation" : sans normalisation, `{waiter,
--     waiter}` redeviendrait possible. A confirmer a la revue du lot 4.
--   - Supprime `admin_users.role`, `invitations.role` et leurs CHECK.
--
-- LE JOUR DE L'APPLICATION. Les corps ci-dessous ont ete generes depuis une
-- base ou MIG1 a MIG4 etaient appliquees (banc du 2026-11-28). La garde de
-- l'etape 0 compare l'empreinte des fonctions en place a celle de ce jour-la :
-- si une autre migration les a modifiees entre-temps (le lot 2 et le lot 3 en
-- toucheront probablement), le fichier s'annule. Regenerer alors les corps.
--
-- RETOUR ARRIERE : restauration depuis la sauvegarde (colonnes supprimees).

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Gardes
-- ---------------------------------------------------------------------------
DO $garde$
DECLARE
  v_ecart text;
BEGIN
  IF to_regclass('public.role_permissions') IS NOT NULL THEN
    RAISE EXCEPTION 'retrait refuse : MIG4 (contraction) n''est pas appliquee';
  END IF;
  SELECT string_agg(a.signature, ', ') INTO v_ecart
  FROM (VALUES
    ('public.is_super_admin()', '4a512e45d720ee04fa48aa36741bec4b'),
    ('public.prevent_super_admin_elevation()', '9ce1c117f1e7d19f51b0cc2a25addf79'),
    ('public.delete_my_account()', 'e24cf2aac399b0591daae9d9b930cdf0'),
    ('public.delete_admin_user_atomic(uuid, uuid)', '79ab4b87ae47d0e9e19c2304307cd710'),
    ('public.anonymize_closed_tenants(timestamp with time zone)', 'c4e0c6bf0d51bd0caca5d12a5666e000'),
    ('public.closed_tenant_auth_users(timestamp with time zone)', '1d62dcde483c002780ee8f5a50b4deed'),
    ('public.request_account_deletion()', 'ebc3711efd11947a15407e8fa7c13f56'),
    ('public.provision_signup_tenant(text, text, text, uuid, text, text, text)', 'af6b083f5aef66ed3ed4528178b143a7'),
    ('public.provision_group_restaurant(uuid, uuid, text, text, text, text, text)', 'b8e08558fc2fa65229bf5340a13c4085'),
    ('public.accept_invitation_membership(uuid, uuid, text)', '27ebd4f424e4af0f2831a76de574c1c0')
  ) AS a(signature, empreinte)
  WHERE (SELECT md5(p.prosrc) FROM pg_catalog.pg_proc AS p
          WHERE p.oid = to_regprocedure(a.signature)) IS DISTINCT FROM a.empreinte;
  IF v_ecart IS NOT NULL THEN
    RAISE EXCEPTION 'retrait refuse : fonction(s) modifiee(s) depuis la redaction de ce fichier (%). Regenerer leurs corps avant d''appliquer.', v_ecart;
  END IF;
END
$garde$;

-- ---------------------------------------------------------------------------
-- 1. Donnees : le drapeau de plateforme, puis plus aucun `admin`
-- ---------------------------------------------------------------------------
-- prevent_super_admin_elevation n'accepte un changement de is_super_admin que
-- d'un appel de service : le reglage est local a cette transaction, et le
-- declencheur n'est pas desactive.
SELECT pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
UPDATE public.admin_users SET is_super_admin = true
 WHERE role = 'super_admin' AND is_super_admin IS DISTINCT FROM true;
SELECT pg_catalog.set_config('request.jwt.claim.role', '', true);

-- Les lignes `admin` portent deja `postes = {manager}` (MIG1) et ont perdu leur
-- reglage billing.manage (MIG4). Elles deviennent des gerants ordinaires.
UPDATE public.admin_users SET role = 'manager' WHERE role = 'admin';
UPDATE public.invitations SET role = 'manager' WHERE role = 'admin';

DO $controle$
DECLARE
  v_ecart int;
BEGIN
  -- La projection doit etre exacte partout avant de supprimer la colonne :
  -- sinon une information ne vivrait que dans `role` et serait perdue.
  SELECT count(*) INTO v_ecart FROM public.admin_users AS a
  WHERE a.role <> 'super_admin'
    AND a.role IS DISTINCT FROM private.role_depuis_postes(a.postes);
  IF v_ecart > 0 THEN
    RAISE EXCEPTION 'retrait refuse : % ligne(s) admin_users dont le role ne correspond pas aux postes', v_ecart;
  END IF;
  SELECT count(*) INTO v_ecart FROM public.admin_users AS a
  WHERE a.role = 'super_admin' AND (a.is_super_admin IS NOT TRUE OR cardinality(a.postes) > 0);
  IF v_ecart > 0 THEN
    RAISE EXCEPTION 'retrait refuse : % ligne(s) super_admin sans drapeau ou portant des postes', v_ecart;
  END IF;
END
$controle$;

-- ---------------------------------------------------------------------------
-- 2. Fonctions qui lisaient `role` (corps en place, seules ces lignes changent)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.mfa_satisfait() AND EXISTS (
    SELECT 1 FROM admin_users
    WHERE user_id = auth.uid()
      AND is_super_admin IS TRUE
      AND COALESCE(is_active, true)
      AND deleted_at IS NULL
  );
$function$;

CREATE OR REPLACE FUNCTION public.prevent_super_admin_elevation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DECLARE
    caller_is_super_admin boolean := false;
    service_role_call boolean := false;
  BEGIN
    BEGIN
      service_role_call := coalesce(
        current_setting('request.jwt.claim.role', true) = 'service_role',
        false
      );
    EXCEPTION WHEN OTHERS THEN
      service_role_call := false;
    END;

    IF service_role_call THEN
      RETURN NEW;
    END IF;

    -- INSERT path
    IF TG_OP = 'INSERT' THEN
      IF NEW.is_super_admin = true THEN
        SELECT coalesce(
          (SELECT au.is_super_admin
             FROM admin_users au
             WHERE au.user_id = auth.uid()
             LIMIT 1),
          false
        ) INTO caller_is_super_admin;

        IF NOT caller_is_super_admin THEN
          RAISE EXCEPTION
            'Only super_admin users can create a super_admin row'
            USING ERRCODE = '42501';
        END IF;
      END IF;
      RETURN NEW;
    END IF;

    -- UPDATE path
    IF OLD.is_super_admin IS NOT DISTINCT FROM NEW.is_super_admin THEN
      RETURN NEW;
    END IF;

    IF NEW.is_super_admin = true AND OLD.is_super_admin IS DISTINCT FROM true THEN

      SELECT coalesce(
        (SELECT au.is_super_admin
           FROM admin_users au
           WHERE au.user_id = auth.uid()
           LIMIT 1),
        false
      ) INTO caller_is_super_admin;

      IF NOT caller_is_super_admin THEN
        RAISE EXCEPTION
          'Only super_admin users can grant super_admin privileges'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    IF OLD.is_super_admin = true AND NEW.is_super_admin IS DISTINCT FROM true THEN

      SELECT coalesce(
        (SELECT au.is_super_admin
           FROM admin_users au
           WHERE au.user_id = auth.uid()
           LIMIT 1),
        false
      ) INTO caller_is_super_admin;

      IF NOT caller_is_super_admin THEN
        RAISE EXCEPTION
          'Only super_admin users can revoke super_admin privileges'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    RETURN NEW;
  END;
  $function$;

CREATE OR REPLACE FUNCTION public.delete_my_account()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_blocking_tenant text;
  m record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'not_authenticated';
  END IF;

  -- Platform operators are never deleted from a tenant app.
  IF EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_uid AND is_super_admin IS TRUE) THEN
    RETURN 'platform_account';
  END IF;

  -- Owner of a restaurant group: the group would cascade-delete.
  IF EXISTS (SELECT 1 FROM restaurant_groups WHERE owner_user_id = v_uid) THEN
    RETURN 'group_owner';
  END IF;

  -- Sole active owner of a live restaurant: deleting would orphan (or wipe) the restaurant.
  SELECT t.name INTO v_blocking_tenant
  FROM admin_users au
  JOIN tenants t ON t.id = au.tenant_id
  WHERE au.user_id = v_uid AND 'owner' = ANY (au.postes) AND t.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM admin_users o
      WHERE o.tenant_id = au.tenant_id AND o.user_id <> v_uid AND 'owner' = ANY (o.postes)
        AND o.is_active IS TRUE AND o.deleted_at IS NULL
    )
  LIMIT 1;
  IF v_blocking_tenant IS NOT NULL THEN
    RETURN 'sole_owner:' || v_blocking_tenant;
  END IF;

  -- Leave every restaurant the way the web removes a member (delete_admin_user_atomic, else-branch).
  FOR m IN SELECT id, tenant_id FROM admin_users WHERE user_id = v_uid LOOP
    UPDATE admin_users SET created_by = NULL WHERE created_by = m.id AND tenant_id = m.tenant_id;
    UPDATE invitations SET invited_by = (
      SELECT id FROM admin_users
      WHERE tenant_id = m.tenant_id AND id <> m.id
      ORDER BY is_active DESC, ('owner' = ANY (postes)) DESC, created_at ASC
      LIMIT 1
    ) WHERE invited_by = m.id AND tenant_id = m.tenant_id;
    DELETE FROM admin_users WHERE id = m.id;
  END LOOP;

  -- References without ON DELETE: keep the restaurant's data, drop the link to the person.
  UPDATE menu_items SET image_uploaded_by = NULL WHERE image_uploaded_by = v_uid;
  UPDATE ai_credits_ledger SET user_id = NULL WHERE user_id = v_uid;
  DELETE FROM dish_photo_drafts WHERE created_by = v_uid;   -- the app removes their files first

  BEGIN
    DELETE FROM auth.users WHERE id = v_uid;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'account_deletion_blocked' USING ERRCODE = 'P0001';   -- rolls everything back
  END;
  RETURN 'deleted';
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_admin_user_atomic(p_admin_user_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id UUID;
  v_group_id UUID;
  tenant_members_total INT;
  user_memberships_remaining INT;
  group_tenants_remaining INT;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM admin_users
  WHERE id = p_admin_user_id;

  IF v_tenant_id IS NULL THEN
    RETURN FALSE;
  END IF;

  PERFORM 1 FROM tenants WHERE id = v_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE id = p_admin_user_id) THEN
    RETURN FALSE;
  END IF;

  SELECT group_id INTO v_group_id FROM tenants WHERE id = v_tenant_id;

  SELECT COUNT(*) INTO tenant_members_total
  FROM admin_users
  WHERE tenant_id = v_tenant_id;

  IF tenant_members_total <= 1 THEN
    DELETE FROM order_items
    WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = v_tenant_id);

    DELETE FROM tenants WHERE id = v_tenant_id;

    IF v_group_id IS NOT NULL THEN
      SELECT COUNT(*) INTO group_tenants_remaining
      FROM tenants
      WHERE group_id = v_group_id;

      IF group_tenants_remaining = 0 THEN
        DELETE FROM restaurant_groups WHERE id = v_group_id;
      END IF;
    END IF;
  ELSE
    UPDATE admin_users SET created_by = NULL
      WHERE created_by = p_admin_user_id AND tenant_id = v_tenant_id;
    UPDATE invitations SET invited_by = (
      SELECT id FROM admin_users
      WHERE tenant_id = v_tenant_id AND id <> p_admin_user_id
      ORDER BY is_active DESC, ('owner' = ANY (postes)) DESC, created_at ASC
      LIMIT 1
    )
    WHERE invited_by = p_admin_user_id AND tenant_id = v_tenant_id;
    DELETE FROM admin_users WHERE id = p_admin_user_id;
  END IF;

  SELECT COUNT(*) INTO user_memberships_remaining
  FROM admin_users
  WHERE user_id = p_user_id;

  IF user_memberships_remaining = 0 THEN
    IF EXISTS (
      SELECT 1
      FROM restaurant_groups g
      JOIN tenants t ON t.group_id = g.id
      WHERE g.owner_user_id = p_user_id
    ) THEN
      RETURN FALSE;
    END IF;

    BEGIN
      DELETE FROM auth.users WHERE id = p_user_id;
      RETURN TRUE;
    EXCEPTION WHEN foreign_key_violation THEN
      RETURN FALSE;
    END;
  END IF;

  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.anonymize_closed_tenants(p_cutoff timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        AND sa.is_super_admin IS TRUE
    );

  -- Comptes clients a credit: le nom (NOT NULL) et la description identifient des
  -- convives. Le lien avec les commandes se fait par id: les soldes et le registre
  -- des paiements ne sont pas touches.
  UPDATE public.house_accounts
  SET name = 'Compte anonymise',
      description = NULL
  WHERE tenant_id = ANY (v_ids);

  -- Le verrou de plan du module Inventaire (`enforce_inventory_entitlement`)
  -- refuserait cette ecriture pour un restaurant ferme sans droit Inventaire,
  -- et ferait echouer TOUTE la purge. Drapeau local a la transaction, lu par
  -- le verrou, retire juste apres (audit B149).
  PERFORM pg_catalog.set_config('attabl.purge_legale', 'on', true);
  UPDATE public.suppliers
  SET contact_name = NULL,
      phone = NULL,
      email = NULL,
      address = NULL,
      notes = NULL
  WHERE tenant_id = ANY (v_ids);
  PERFORM pg_catalog.set_config('attabl.purge_legale', '', true);

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
$function$;

CREATE OR REPLACE FUNCTION public.closed_tenant_auth_users(p_cutoff timestamp with time zone)
 RETURNS TABLE(auth_user_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        AND sa.is_super_admin IS TRUE
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.admin_users other
      JOIN public.tenants ot ON ot.id = other.tenant_id
      WHERE other.user_id = au.user_id
        AND ot.anonymized_at IS NULL
        AND NOT (ot.deleted_at IS NOT NULL AND ot.deleted_at < p_cutoff)
    );
$function$;

CREATE OR REPLACE FUNCTION public.request_account_deletion()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;
  insert into account_deletion_requests (user_id, email, restaurants)
  select v_uid,
         (select email from auth.users where id = v_uid),
         coalesce((select string_agg(t.name, ', ' order by t.name)
                   from admin_users au join tenants t on t.id = au.tenant_id
                   where au.user_id = v_uid), '')
  on conflict (user_id) do nothing;

  if found then
    insert into notifications (tenant_id, user_id, type, title, body, read)
    select op.tenant_id, op.user_id, 'info', 'Demande de suppression de compte',
           r.email || case when r.restaurants <> '' then ' (' || r.restaurants || ')' else '' end
             || '. A traiter sous 30 jours : table account_deletion_requests.',
           false
    from admin_users op, account_deletion_requests r
    where r.user_id = v_uid
      and op.is_super_admin is true
      and op.is_active is true and op.tenant_id is not null;
  end if;
  return 'requested';
end;
$function$;

CREATE OR REPLACE FUNCTION public.provision_signup_tenant(p_slug text, p_name text, p_plan text, p_user_id uuid, p_email text, p_full_name text, p_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  INSERT INTO admin_users (tenant_id, user_id, email, full_name, phone, postes, is_active)
  VALUES (v_tenant_id, p_user_id, p_email, p_full_name, p_phone, ARRAY['owner'], true);

  INSERT INTO venues (tenant_id, slug, name, name_en, type, is_active)
  VALUES (v_tenant_id, 'main', 'Salle principale', 'Main Dining', 'restaurant', true);

  RETURN jsonb_build_object(
    'tenantId', v_tenant_id,
    'slug', p_slug,
    'groupId', v_group_id,
    'trialMode', v_mode
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.provision_group_restaurant(p_group_id uuid, p_user_id uuid, p_email text, p_name text, p_slug text, p_type text, p_plan text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  INSERT INTO admin_users (tenant_id, user_id, email, full_name, postes, is_active)
  VALUES (v_tenant_id, p_user_id, p_email, p_name, ARRAY['owner'], true);

  INSERT INTO venues (tenant_id, slug, name, name_en, type, is_active)
  VALUES (v_tenant_id, 'main', 'Salle principale', 'Main Dining', p_type, true);

  RETURN jsonb_build_object('tenantId', v_tenant_id, 'slug', p_slug, 'trialMode', v_mode);
END;
$function$;

CREATE OR REPLACE FUNCTION public.accept_invitation_membership(p_invitation_id uuid, p_user_id uuid, p_full_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inv invitations%ROWTYPE;
  v_slug text;
BEGIN
  SELECT * INTO v_inv
  FROM invitations
  WHERE id = p_invitation_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_inv.expires_at < now() THEN
    UPDATE invitations SET status = 'expired' WHERE id = v_inv.id;
    RAISE EXCEPTION 'INVITATION_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO admin_users (
    user_id, tenant_id, email, full_name, is_active, postes, permission_overrides, created_by
  ) VALUES (
    p_user_id, v_inv.tenant_id, v_inv.email,
    COALESCE(NULLIF(trim(p_full_name), ''), v_inv.email),
    true, v_inv.postes, v_inv.permission_overrides, v_inv.invited_by
  );

  UPDATE invitations SET status = 'accepted', accepted_at = now() WHERE id = v_inv.id;

  SELECT slug INTO v_slug FROM tenants WHERE id = v_inv.tenant_id;

  RETURN jsonb_build_object('tenantId', v_inv.tenant_id, 'tenantSlug', COALESCE(v_slug, ''));
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Politique restrictive : meme texte, sans `role`
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Block super_admin escalation by non-super-admins" ON public.admin_users;
CREATE POLICY "Block super_admin escalation by non-super-admins"
  ON public.admin_users
  AS RESTRICTIVE
  USING (
    (COALESCE(is_super_admin, false) = false)
    OR public.is_super_admin()
    OR (user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    (COALESCE(is_super_admin, false) = false)
    OR public.is_super_admin()
  );

-- ---------------------------------------------------------------------------
-- 4. Declencheurs : plus de synchronisation, seulement la normalisation
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS aa_admin_users_sync_postes ON public.admin_users;
DROP TRIGGER IF EXISTS aa_invitations_sync_postes ON public.invitations;
DROP FUNCTION IF EXISTS private.sync_postes_admin_users();
DROP FUNCTION IF EXISTS private.sync_postes_invitations();

CREATE OR REPLACE FUNCTION private.normaliser_postes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  NEW.postes := private.postes_normalises(NEW.postes);
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.normaliser_postes() FROM PUBLIC, anon, authenticated, service_role;

-- Meme prefixe `aa_` : passe avant garder_proprietaire_trg.
CREATE TRIGGER aa_admin_users_normaliser_postes BEFORE INSERT OR UPDATE OF postes ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION private.normaliser_postes();
CREATE TRIGGER aa_invitations_normaliser_postes BEFORE INSERT OR UPDATE OF postes ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION private.normaliser_postes();

-- ---------------------------------------------------------------------------
-- 5. Contrainte qui citait `role`, puis les colonnes
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_postes_non_vide;
ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_postes_non_vide CHECK (
  cardinality(postes) >= 1 OR is_super_admin IS TRUE);

-- Sans CASCADE : un objet inattendu qui lirait encore `role` annule tout.
ALTER TABLE public.admin_users DROP COLUMN IF EXISTS role;
ALTER TABLE public.invitations DROP COLUMN IF EXISTS role;

DROP FUNCTION IF EXISTS private.postes_depuis_role(text);
DROP FUNCTION IF EXISTS private.role_depuis_postes(text[]);

-- ---------------------------------------------------------------------------
-- 6. Balayage : plus aucune fonction ne cite les fonctions supprimees
-- ---------------------------------------------------------------------------
DO $balayage$
DECLARE
  v_reste text;
BEGIN
  SELECT string_agg(n.nspname || '.' || p.proname, ', ') INTO v_reste
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'private')
    AND p.prosrc ~ '(postes_depuis_role|role_depuis_postes|sync_postes_)';
  IF v_reste IS NOT NULL THEN
    RAISE EXCEPTION 'retrait annule : fonction(s) citant encore un objet supprime : %', v_reste;
  END IF;
END
$balayage$;

COMMIT;
