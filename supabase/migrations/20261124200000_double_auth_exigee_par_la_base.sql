-- Double authentification exigee PAR LA BASE (audit K6.13, revue de securite
-- du 2026-11-24).
--
-- POURQUOI. La double authentification TOTP est verifiee par l'application
-- (pages, routes d'API, Server Actions). Mais la cle publique (anon) et le
-- jeton d'un compte suffisent pour interroger PostgREST directement: un
-- attaquant qui connait le mot de passe d'un compte PROTEGE obtient un jeton
-- de niveau aal1 et lisait ou ecrivait les tables sans jamais passer par
-- l'application, donc sans le code. La protection doit vivre la ou vivent les
-- droits: dans la base.
--
-- COMMENT. Une fonction unique, `public.mfa_satisfait()`: vraie si le compte
-- n'a AUCUN facteur verifie (rien ne change pour lui), ou si le jeton est de
-- niveau aal2. Elle est ajoutee aux quatre fonctions communes sur lesquelles
-- reposent 182 des 193 politiques RLS et les gardes des fonctions SECURITY
-- DEFINER (`has_tenant_write_permission`, et par elle
-- has_tenant_floor_permission / has_tenant_money_permission /
-- assert_inventory_edit..., plus `get_my_tenant_ids_array`,
-- `get_my_tenant_ids`, `is_super_admin`). Un compte protege en aal1 n'a donc
-- plus aucun droit de restaurant ni de plateforme tant qu'il n'a pas saisi son
-- code. Les corps sont ceux de schema.sql et des migrations posterieures,
-- recopies tels quels, avec la seule condition ajoutee.
--
-- CE QUI RESTE OUVERT EN aal1, volontairement:
--   - sa propre ligne admin_users (politique `user_id = auth.uid()`, deja
--     sans fonction): la connexion en a besoin pour savoir ou envoyer la
--     personne apres le code;
--   - la lecture des restaurants dont on est membre (nom, slug, etat
--     d'onboarding: informations non sensibles, deja publiques pour les
--     restaurants actifs), par une politique dediee: sans elle, la
--     destination calculee avant le code serait fausse.
--   - service_role et anon: auth.uid() est nul, aucun facteur, rien ne change.
--
-- ORDRE DE DEPLOIEMENT: APRES le code de la double authentification (page
-- /auth/mfa et aiguillage de connexion), sinon un compte qui aurait active un
-- facteur hors de l'application perdrait ses droits sans moyen de saisir son
-- code. Aucun compte de production n'a de facteur aujourd'hui (la fonction
-- n'existait pas): en pratique l'effet est nul jusqu'au premier enrolement.
-- PREALABLE: TOTP active dans Supabase Auth.
--
-- RETOUR ARRIERE: rejouer les definitions des quatre fonctions depuis
-- supabase/schema.sql (sans `public.mfa_satisfait()`), supprimer la politique
-- "Membres: lecture de leurs restaurants (avant double authentification)",
-- puis `DROP FUNCTION public.mfa_satisfait();`.

BEGIN;

CREATE OR REPLACE FUNCTION public.mfa_satisfait()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT coalesce((SELECT auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
      OR NOT EXISTS (
        SELECT 1
        FROM auth.mfa_factors f
        WHERE f.user_id = (SELECT auth.uid())
          AND f.status = 'verified'
      );
$function$;

COMMENT ON FUNCTION public.mfa_satisfait() IS
  'Vrai si le compte appelant n a aucun facteur MFA verifie, ou si son jeton est aal2. Ajoutee aux fonctions de droits communes (double authentification exigee par la base).';

-- Aide de politiques RLS: doit rester executable par anon et authenticated.
REVOKE ALL ON FUNCTION public.mfa_satisfait() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mfa_satisfait() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_tenant_write_permission(p_tenant uuid, p_perm text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.mfa_satisfait() AND EXISTS (
    SELECT 1
    FROM public.admin_users au
    LEFT JOIN public.role_permissions rp
      ON rp.tenant_id = au.tenant_id AND rp.role = au.role
    WHERE au.user_id = (SELECT auth.uid())
      AND au.tenant_id = p_tenant
      AND (au.is_active IS NULL OR au.is_active = true)
      AND au.deleted_at IS NULL
      AND (
        au.role = 'owner'
        OR CASE
             -- Surcharge individuelle de l'employe: elle tranche, dans les
             -- deux sens, pour n'importe quel role.
             WHEN au.custom_permissions ? p_perm
               THEN (au.custom_permissions -> p_perm) = 'true'::jsonb
             -- Puis la surcharge de role posee par le proprietaire.
             WHEN rp.permissions ? p_perm
               THEN (rp.permissions -> p_perm) = 'true'::jsonb
             -- Sans surcharge: DEFAULT_PERMISSIONS (src/types/permission.types.ts).
             ELSE CASE p_perm
                    WHEN 'orders.manage'
                      THEN au.role = ANY (ARRAY['admin', 'manager', 'cashier', 'chef', 'waiter'])
                    WHEN 'orders.pay'
                      THEN au.role = ANY (ARRAY['admin', 'manager', 'cashier'])
                    WHEN 'settings.edit'
                      THEN au.role = 'admin'
                    WHEN 'menu.edit'
                      THEN au.role = ANY (ARRAY['admin', 'manager'])
                    WHEN 'inventory.edit'
                      THEN au.role = ANY (ARRAY['admin', 'manager'])
                    -- B127: DEFAULT_PERMISSIONS donne aussi la lecture du stock
                    -- au chef (permission.types.ts), pas au caissier ni au serveur.
                    WHEN 'inventory.view'
                      THEN au.role = ANY (ARRAY['admin', 'manager', 'chef'])
                    ELSE au.role = ANY (ARRAY['admin', 'manager'])
                  END
           END
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_my_tenant_ids_array()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(array_agg(tenant_id), '{}')
  from admin_users
  where user_id = auth.uid()
    and coalesce(is_active, true) = true
    and public.mfa_satisfait()
$function$;

CREATE OR REPLACE FUNCTION public.get_my_tenant_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select tenant_id
  from admin_users
  where user_id = auth.uid()
    and coalesce(is_active, true) = true
    and public.mfa_satisfait()
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.mfa_satisfait() AND EXISTS (
    SELECT 1 FROM admin_users
    WHERE user_id = auth.uid()
      AND (is_super_admin = true OR role = 'super_admin')
      AND COALESCE(is_active, true)
      AND deleted_at IS NULL
  );
$function$;

-- Lecture de ses propres restaurants AVANT la double authentification (voir
-- l'en-tete): seulement les restaurants dont on est membre vivant.
DROP POLICY IF EXISTS "Membres: lecture de leurs restaurants (avant double authentification)" ON public.tenants;
CREATE POLICY "Membres: lecture de leurs restaurants (avant double authentification)"
  ON public.tenants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.admin_users au
      WHERE au.tenant_id = tenants.id
        AND au.user_id = (SELECT auth.uid())
        AND coalesce(au.is_active, true) = true
        AND au.deleted_at IS NULL
    )
  );

COMMIT;
