-- RETOUR ARRIERE de MIG1 (20261128100000_postes_colonnes_et_reprise.sql).
--
-- Supprime les declencheurs de synchronisation, les deux index uniques, les
-- contraintes, la table poste_permissions, les colonnes `postes` et
-- `permission_overrides`, les fonctions du lot, et retablit les deux CHECK de
-- `role` ainsi que accept_invitation_membership (copie de supabase/schema.sql).
--
-- CE QUI N'EST PAS RETABLI, volontairement : le DEFAULT 'admin' de
-- admin_users.role. Un INSERT qui oublie le role doit continuer d'echouer
-- plutot que de creer un administrateur complet.
--
-- QUAND. Apres les retours arriere de MIG3 et de MIG2, et seulement AVANT la
-- fusion du code qui ecrit au nouveau format : ce script SUPPRIME deux
-- colonnes et une table. La meme garde que le retour de MIG2 refuse de tourner
-- si le nouveau code a ecrit. Aucune donnee ancienne (role,
-- custom_permissions, role_permissions) n'a ete modifiee par MIG1 : rien a
-- restaurer de ce cote.
--
-- LANCEMENT : psql "$URL" -X -v ON_ERROR_STOP=1 -f ce_fichier

BEGIN;

-- 0. Ordre : le resolveur par postes (MIG2) et les gardes (MIG3) lisent les
--    colonnes que ce script supprime. Ils doivent etre partis.
DO $ordre$
BEGIN
  IF to_regprocedure('public.tenant_permission_level(uuid, text)') IS NOT NULL THEN
    RAISE EXCEPTION 'retour arriere refuse : lancer d''abord le retour arriere de MIG2 (tenant_permission_level existe encore)';
  END IF;
  IF to_regprocedure('private.garder_proprietaire()') IS NOT NULL THEN
    RAISE EXCEPTION 'retour arriere refuse : lancer d''abord le retour arriere de MIG3 (garder_proprietaire existe encore)';
  END IF;
END
$ordre$;

-- 1. Garde : la meme que le retour arriere de MIG2, mot pour mot. Entre les
--    deux scripts le nouveau code a pu ecrire.
DO $garde$
DECLARE
  v_personnes int; v_cumuls int; v_postes int; v_invitations int;
BEGIN
  -- 1a. reglages par personne
  SELECT count(*) INTO v_personnes FROM public.admin_users AS a
  WHERE coalesce(a.permission_overrides, '{}'::jsonb)
          - CASE WHEN a.role = 'admin' THEN 'billing.manage' ELSE '' END
        IS DISTINCT FROM coalesce(private.droits_depuis_anciens(a.custom_permissions), '{}'::jsonb);
  -- 1b. postes : un cumul, ou un poste que l'ancien role ne donne pas (N4)
  SELECT count(*) INTO v_cumuls FROM public.admin_users AS a
  WHERE a.postes IS DISTINCT FROM private.postes_normalises(private.postes_depuis_role(a.role));
  -- 1c. reglages par poste
  SELECT count(*) INTO v_postes FROM public.poste_permissions AS pp
  WHERE NOT EXISTS (
    SELECT 1 FROM public.role_permissions AS rp
    WHERE rp.tenant_id = pp.tenant_id AND rp.role = pp.poste
      AND coalesce(private.droits_depuis_anciens(rp.permissions), '{}'::jsonb) = pp.permissions);
  -- 1d. invitations en attente : postes et reglages (N4)
  SELECT count(*) INTO v_invitations FROM public.invitations AS i
  WHERE i.status = 'pending'
    AND ( i.postes IS DISTINCT FROM private.postes_normalises(private.postes_depuis_role(i.role))
       OR coalesce(i.permission_overrides, '{}'::jsonb)
            - CASE WHEN i.role = 'admin' THEN 'billing.manage' ELSE '' END
          IS DISTINCT FROM coalesce(private.droits_depuis_anciens(i.custom_permissions), '{}'::jsonb) );
  IF v_personnes > 0 OR v_cumuls > 0 OR v_postes > 0 OR v_invitations > 0 THEN
    RAISE EXCEPTION 'retour arriere refuse : % reglage(s) par personne, % cumul(s) de postes, % reglage(s) par poste, % invitation(s) ecrits au nouveau format',
      v_personnes, v_cumuls, v_postes, v_invitations;
  END IF;
END
$garde$;

-- 2. Declencheurs et leurs fonctions.
DROP TRIGGER IF EXISTS role_permissions_vers_postes ON public.role_permissions;
DROP TRIGGER IF EXISTS aa_invitations_sync_postes ON public.invitations;
DROP TRIGGER IF EXISTS aa_admin_users_sync_postes ON public.admin_users;
DROP FUNCTION IF EXISTS public.role_permissions_vers_postes();
DROP FUNCTION IF EXISTS private.sync_postes_invitations();
DROP FUNCTION IF EXISTS private.sync_postes_admin_users();

-- 3. accept_invitation_membership : copie mot pour mot de supabase/schema.sql
--    (elle ne lit plus les deux colonnes supprimees plus bas).
CREATE OR REPLACE FUNCTION "public"."accept_invitation_membership"("p_invitation_id" "uuid", "p_user_id" "uuid", "p_full_name" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
    user_id, tenant_id, email, full_name, role, is_active, custom_permissions, created_by
  ) VALUES (
    p_user_id, v_inv.tenant_id, v_inv.email,
    COALESCE(NULLIF(trim(p_full_name), ''), v_inv.email),
    v_inv.role, true, v_inv.custom_permissions, v_inv.invited_by
  );

  UPDATE invitations SET status = 'accepted', accepted_at = now() WHERE id = v_inv.id;

  SELECT slug INTO v_slug FROM tenants WHERE id = v_inv.tenant_id;

  RETURN jsonb_build_object('tenantId', v_inv.tenant_id, 'tenantSlug', COALESCE(v_slug, ''));
END;
$$;

-- 4. Index, contraintes, table, colonnes.
DROP INDEX IF EXISTS public.admin_users_tenant_user_vivant;
DROP INDEX IF EXISTS public.admin_users_un_proprietaire;
ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_overrides_check;
ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_postes_non_vide;
ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_postes_check;
ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_overrides_check;
ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_postes_non_vide;
ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_postes_check;
DROP TABLE IF EXISTS public.poste_permissions;
ALTER TABLE public.invitations DROP COLUMN IF EXISTS permission_overrides;
ALTER TABLE public.invitations DROP COLUMN IF EXISTS postes;
ALTER TABLE public.admin_users DROP COLUMN IF EXISTS permission_overrides;
ALTER TABLE public.admin_users DROP COLUMN IF EXISTS postes;

-- 5. Les deux CHECK de `role`, tels qu'ils etaient. Echoue (et annule tout) si
--    une ligne porte deja un role nouveau : c'est voulu, ce cas se corrige en avant.
ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_role_check CHECK (role = ANY (ARRAY[
  'owner'::text, 'admin'::text, 'manager'::text, 'cashier'::text, 'chef'::text, 'waiter'::text, 'super_admin'::text]));
ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_role_check CHECK (role = ANY (ARRAY[
  'admin'::text, 'manager'::text, 'cashier'::text, 'chef'::text, 'waiter'::text]));

-- 6. Fonctions du lot, apres que plus rien ne les appelle.
DROP FUNCTION IF EXISTS public.is_tenant_owner(uuid);
DROP FUNCTION IF EXISTS private.fusion_anciens_droits(jsonb, jsonb, jsonb);
DROP FUNCTION IF EXISTS private.droits_depuis_anciens(jsonb);
DROP FUNCTION IF EXISTS private.postes_normalises(text[]);
DROP FUNCTION IF EXISTS private.role_depuis_postes(text[]);
DROP FUNCTION IF EXISTS private.postes_depuis_role(text);
DROP FUNCTION IF EXISTS private.droits_valides(jsonb);
DROP FUNCTION IF EXISTS private.matrice_postes();
DROP FUNCTION IF EXISTS private.codes_droits();

COMMIT;
