-- ===========================================================================
-- MIGRATION DIFFEREE. NE PAS DEPLACER dans supabase/migrations/ AVANT L'ETAPE 9
-- du deroule (docs/roles-personnel/conception-lot1.md, E.2). Ce dossier
-- (supabase/migrations-differees/) n'est lu par AUCUN outil : ni
-- scripts/run-pgtap.sh, ni la CI, ni `supabase db push`. Appliquer ce fichier
-- avec les trois migrations additives couperait l'ancien code en plein service.
-- ===========================================================================
--
-- Lot 1 des roles du personnel, MIG4 : contraction des anciens reglages.
--
-- CE QUE CE FICHIER RETIRE. `admin_users.custom_permissions`,
-- `invitations.custom_permissions`, la table `role_permissions`, et tout ce qui
-- les traduisait (declencheur de report, branches des declencheurs de
-- synchronisation, fonctions de traduction). C'est un RETRAIT D'ACCES pour
-- l'ancien code : il ne passe qu'APRES que le nouveau code est servi et verifie.
--
-- DECISION G.f du proprietaire (2026-11-28) : l'ancien administrateur devient
-- un gerant SIMPLE des que le nouveau code est servi. Ce fichier retire donc le
-- reglage `billing.manage: true` pose par la reprise sur les lignes
-- `role = 'admin'` (membres et invitations en attente), et les declencheurs ne
-- le reposent plus.
--
-- CONDITIONS, toutes requises (E.2 etape 9) :
--   (a) /api/version rend le SHA de la fusion du code du lot 1 ;
--   (b) le workflow promote-prod est vert sur ce commit ;
--   (c) la verification a l'ecran de chaque poste est faite et archivee ;
--   (d) `rg -n "custom_permissions|role_permissions" src scripts tests
--        --glob '!src/types/database.generated.ts'` rend 0 ligne sur origin/main ;
--   (e) aucune ecriture dans les anciennes colonnes depuis la fusion.
-- Date limite : le jour de la fusion, au plus tard le jour ouvre suivant.
-- Sauvegarde AVANT, accord ecrit du proprietaire (suppression de colonnes).
--
-- LE JOUR DE L'APPLICATION.
--   1. Renommer le fichier avec un horodatage posterieur a la derniere
--      migration appliquee, puis le deplacer dans supabase/migrations/.
--   2. Dans la MEME PR : adapter les tests pgTAP qui ecrivent encore
--      `custom_permissions` ou `role_permissions` (ils servent a prouver la
--      transition, qui est alors finie), supprimer
--      supabase/tests/rls/transition_anciens_roles.test.sql (sections A, D, E)
--      ou le reduire a ce qui reste vrai, regenerer supabase/schema.sql et les
--      types, supprimer supabase/retour-arriere/2026112810* et son test.
--   3. Les corps de fonctions ci-dessous ont ete generes depuis une base ou
--      MIG1 a MIG3 etaient appliquees (banc du 2026-11-28). La garde de
--      l'etape 0 compare l'empreinte des fonctions en place a celle de ce
--      jour-la : si une autre migration les a modifiees entre-temps, le fichier
--      s'annule au lieu d'ecraser leur version. Dans ce cas, regenerer.
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
  IF to_regprocedure('public.tenant_permission_level(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'contraction refusee : MIG2 (resolution par postes) n''est pas appliquee';
  END IF;
  SELECT string_agg(a.signature, ', ') INTO v_ecart
  FROM (VALUES
    ('public.accept_invitation_membership(uuid, uuid, text)', '2d29249d3657c7ed9a48e2e436e526eb'),
    ('public.delete_admin_user_atomic(uuid, uuid)', 'e3177c313aa851202865d1998eb6c6e1'),
    ('public.delete_my_account()', '29adbeac860dec76a789e9679d9fe009')
  ) AS a(signature, empreinte)
  WHERE (SELECT md5(p.prosrc) FROM pg_catalog.pg_proc AS p
          WHERE p.oid = to_regprocedure(a.signature)) IS DISTINCT FROM a.empreinte;
  IF v_ecart IS NOT NULL THEN
    RAISE EXCEPTION 'contraction refusee : fonction(s) modifiee(s) depuis la redaction de ce fichier (%). Regenerer leurs corps avant d''appliquer.', v_ecart;
  END IF;
END
$garde$;

-- ---------------------------------------------------------------------------
-- 1. Declencheurs de synchronisation, sans les branches custom_permissions et
--    sans le reglage billing.manage de l'ancien administrateur (G.f)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.sync_postes_admin_users() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  NEW.postes := private.postes_normalises(NEW.postes);
  IF TG_OP = 'INSERT' THEN
    IF cardinality(NEW.postes) = 0 THEN
      NEW.postes := private.postes_depuis_role(NEW.role);
    ELSIF NEW.role IS DISTINCT FROM 'super_admin' THEN
      NEW.role := private.role_depuis_postes(NEW.postes);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.postes IS DISTINCT FROM OLD.postes THEN
    IF NEW.role IS DISTINCT FROM 'super_admin' AND cardinality(NEW.postes) > 0 THEN
      NEW.role := private.role_depuis_postes(NEW.postes);
    END IF;
  ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
    NEW.postes := private.postes_depuis_role(NEW.role);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.sync_postes_invitations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  NEW.postes := private.postes_normalises(NEW.postes);
  IF TG_OP = 'INSERT' THEN
    IF cardinality(NEW.postes) = 0 THEN
      NEW.postes := private.postes_depuis_role(NEW.role);
    ELSE
      NEW.role := private.role_depuis_postes(NEW.postes);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.postes IS DISTINCT FROM OLD.postes THEN
    IF cardinality(NEW.postes) > 0 THEN
      NEW.role := private.role_depuis_postes(NEW.postes);
    END IF;
  ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
    NEW.postes := private.postes_depuis_role(NEW.role);
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. G.f : l'ancien administrateur devient un gerant simple
-- ---------------------------------------------------------------------------
-- Seul le `true` pose par la reprise est retire. Un `false` pose par le
-- proprietaire est conserve (le retirer rendrait au compte la lecture des
-- factures).
UPDATE public.admin_users
   SET permission_overrides = nullif(permission_overrides - 'billing.manage', '{}'::jsonb)
 WHERE role = 'admin' AND (permission_overrides -> 'billing.manage') = 'true'::jsonb;
UPDATE public.invitations
   SET permission_overrides = nullif(permission_overrides - 'billing.manage', '{}'::jsonb)
 WHERE role = 'admin' AND status = 'pending'
   AND (permission_overrides -> 'billing.manage') = 'true'::jsonb;

-- ---------------------------------------------------------------------------
-- 3. Fonctions qui lisaient les anciens objets (corps en place, lignes retirees)
-- ---------------------------------------------------------------------------
-- accept_invitation_membership : ne copie plus custom_permissions.
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
    user_id, tenant_id, email, full_name, role, is_active, postes, permission_overrides, created_by
  ) VALUES (
    p_user_id, v_inv.tenant_id, v_inv.email,
    COALESCE(NULLIF(trim(p_full_name), ''), v_inv.email),
    v_inv.role, true, v_inv.postes, v_inv.permission_overrides, v_inv.invited_by
  );

  UPDATE invitations SET status = 'accepted', accepted_at = now() WHERE id = v_inv.id;

  SELECT slug INTO v_slug FROM tenants WHERE id = v_inv.tenant_id;

  RETURN jsonb_build_object('tenantId', v_inv.tenant_id, 'tenantSlug', COALESCE(v_slug, ''));
END;
$function$;

-- delete_admin_user_atomic et delete_my_account : plus de
-- `UPDATE role_permissions SET updated_by = NULL`. poste_permissions.updated_by
-- est en ON DELETE SET NULL, il n'y a rien a remettre a NULL a la main.
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
      ORDER BY is_active DESC, (role = 'owner') DESC, created_at ASC
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
  IF EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_uid AND (is_super_admin IS TRUE OR role = 'super_admin')) THEN
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
  WHERE au.user_id = v_uid AND au.role = 'owner' AND t.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM admin_users o
      WHERE o.tenant_id = au.tenant_id AND o.user_id <> v_uid AND o.role = 'owner'
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
      ORDER BY is_active DESC, (role = 'owner') DESC, created_at ASC
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

-- ---------------------------------------------------------------------------
-- 4. Suppressions
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS role_permissions_vers_postes ON public.role_permissions;
DROP FUNCTION IF EXISTS public.role_permissions_vers_postes();
-- Sans CASCADE : si un objet inattendu depend encore de la table ou des
-- colonnes, la migration s'annule au lieu de l'emporter en silence.
DROP TABLE IF EXISTS public.role_permissions;
ALTER TABLE public.admin_users DROP COLUMN IF EXISTS custom_permissions;
ALTER TABLE public.invitations DROP COLUMN IF EXISTS custom_permissions;
DROP FUNCTION IF EXISTS private.fusion_anciens_droits(jsonb, jsonb, jsonb);
DROP FUNCTION IF EXISTS private.droits_depuis_anciens(jsonb);

-- ---------------------------------------------------------------------------
-- 5. Balayage : plus aucune fonction ne cite les objets supprimes
-- ---------------------------------------------------------------------------
DO $balayage$
DECLARE
  v_reste text;
BEGIN
  SELECT string_agg(n.nspname || '.' || p.proname, ', ') INTO v_reste
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'private')
    AND p.prosrc ~ '(custom_permissions|role_permissions|fusion_anciens_droits|droits_depuis_anciens)';
  IF v_reste IS NOT NULL THEN
    RAISE EXCEPTION 'contraction annulee : fonction(s) citant encore un objet supprime : %', v_reste;
  END IF;
END
$balayage$;

COMMIT;
