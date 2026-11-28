-- Lot 1 des roles du personnel, MIG1 : colonnes de postes, reglages au nouveau
-- format, table poste_permissions, reprise des donnees, declencheurs de
-- synchronisation (conception : docs/roles-personnel/conception-lot1.md, A, B, E.1).
--
-- POURQUOI. Un membre porte desormais une LISTE de postes (cumul) au lieu d'un
-- role unique, et les droits passent de 13 a 22 codes. Sept anciens codes
-- gardent leur nom mais changent de sens (`menu.edit` contenait les prix) :
-- les reglages au nouveau format vivent donc dans des colonnes NOUVELLES
-- (`permission_overrides`, `poste_permissions`), et des declencheurs traduisent
-- les ecritures de l'ancien code, encore en service pendant la transition.
--
-- ADDITIVE. Aucune donnee ancienne n'est modifiee : `role`, `custom_permissions`
-- et `role_permissions` restent lus et ecrits par l'ancien code. La resolution
-- des droits ne change PAS dans ce fichier (elle change dans MIG2,
-- 20261128100100, qui doit etre appliquee avec celui-ci).
--
-- PREALABLES (controles E.0 de la conception, en lecture seule, sur la base
-- cible AVANT d'appliquer) : aucun restaurant avec deux proprietaires vivants,
-- aucune personne avec deux lignes vivantes dans un restaurant. Sinon les deux
-- index uniques de l'etape 7 echouent et toute la transaction est annulee. Si
-- le controle 6 rend des lignes (gerant portant `orders.manage: false` ou
-- `settings.view: false`), ajouter leur liste a l'etape 5 avant d'appliquer.
--
-- RETOUR ARRIERE : supabase/retour-arriere/20261128100000_retour_postes_colonnes.sql
-- (apres ceux de MIG3 et MIG2, et seulement AVANT la fusion du code).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Fonctions qui ne lisent aucune colonne nouvelle
-- ---------------------------------------------------------------------------

-- Le catalogue : les 22 codes, dans l'ordre du cahier des charges.
CREATE OR REPLACE FUNCTION private.codes_droits() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = '' AS $function$
  SELECT ARRAY[
    'menu.view','menu.edit','menu.price',
    'orders.take','kitchen.track','orders.cancel','orders.discount','orders.refund',
    'orders.pay','cash.close','cash.count',
    'reports.menu','reports.money','reports.own',
    'inventory.view','inventory.edit','suppliers.manage',
    'team.view','team.manage','settings.edit','audit.view','billing.manage'
  ]::text[];
$function$;

-- La matrice par defaut : 86 cases, une par ligne logique, dans l'ordre poste
-- puis code. Copie de POSTE_MATRIX (src/types/permission.types.ts) ; un test de
-- parite interdit tout ecart. `owner` n'y figure pas : il a toujours tout.
-- Une FONCTION et pas une table : schema.sql est un instantane de schema sans
-- donnees, une table de reference y perdrait ses lignes.
CREATE OR REPLACE FUNCTION private.matrice_postes()
RETURNS TABLE (poste text, droit text, niveau text)
LANGUAGE sql IMMUTABLE SET search_path = '' AS $function$
  VALUES
    ('manager','menu.view','full'), ('manager','menu.edit','full'), ('manager','menu.price','full'),
    ('manager','orders.take','full'), ('manager','kitchen.track','full'), ('manager','orders.cancel','full'),
    ('manager','orders.discount','full'), ('manager','orders.refund','full'), ('manager','orders.pay','full'),
    ('manager','cash.close','full'), ('manager','cash.count','full'), ('manager','reports.menu','full'),
    ('manager','reports.money','full'), ('manager','reports.own','full'), ('manager','inventory.view','full'),
    ('manager','inventory.edit','full'), ('manager','suppliers.manage','full'), ('manager','team.view','full'),
    ('manager','team.manage','full'), ('manager','settings.edit','full'), ('manager','audit.view','full'),
    ('manager','billing.manage','limited'),
    ('chef','menu.view','full'), ('chef','menu.edit','full'), ('chef','menu.price','full'),
    ('chef','kitchen.track','full'), ('chef','reports.menu','full'), ('chef','inventory.view','full'),
    ('chef','inventory.edit','full'), ('chef','suppliers.manage','full'),
    ('cashier','menu.view','full'), ('cashier','orders.take','full'), ('cashier','orders.cancel','limited'),
    ('cashier','orders.discount','limited'), ('cashier','orders.refund','limited'), ('cashier','orders.pay','full'),
    ('cashier','cash.count','full'), ('cashier','reports.own','full'),
    ('bartender','menu.view','full'), ('bartender','orders.take','full'), ('bartender','kitchen.track','full'),
    ('bartender','orders.cancel','limited'), ('bartender','orders.discount','limited'), ('bartender','orders.refund','limited'),
    ('bartender','orders.pay','full'), ('bartender','cash.count','full'), ('bartender','reports.own','full'),
    ('bartender','inventory.view','full'),
    ('reception','menu.view','full'), ('reception','orders.take','full'), ('reception','orders.cancel','limited'),
    ('reception','orders.discount','limited'), ('reception','orders.refund','limited'), ('reception','orders.pay','full'),
    ('reception','cash.count','full'), ('reception','reports.own','full'),
    ('waiter','menu.view','full'), ('waiter','orders.take','full'), ('waiter','orders.cancel','limited'),
    ('waiter','orders.discount','limited'), ('waiter','orders.pay','limited'), ('waiter','reports.own','full'),
    ('cook','menu.view','full'), ('cook','kitchen.track','full'), ('cook','inventory.view','full'),
    ('crew','menu.view','full'), ('crew','orders.take','full'), ('crew','kitchen.track','full'),
    ('crew','orders.cancel','limited'), ('crew','orders.discount','limited'), ('crew','orders.refund','limited'),
    ('crew','orders.pay','full'), ('crew','cash.count','full'), ('crew','reports.own','full'),
    ('crew','inventory.view','full'),
    ('sales','menu.view','full'), ('sales','orders.take','full'), ('sales','orders.cancel','limited'),
    ('sales','orders.discount','limited'), ('sales','orders.refund','limited'), ('sales','orders.pay','full'),
    ('sales','cash.count','full'), ('sales','reports.own','full'),
    ('production','menu.view','full'), ('production','kitchen.track','full'), ('production','inventory.view','full')
  ;
$function$;

-- Un reglage est valide s'il est un objet dont chaque cle est un code du
-- catalogue et chaque valeur un booleen. CASE : l'ordre d'evaluation est
-- garanti, jsonb_each n'est jamais appele sur autre chose qu'un objet.
CREATE OR REPLACE FUNCTION private.droits_valides(p jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT CASE
    WHEN p IS NULL OR jsonb_typeof(p) <> 'object' THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM jsonb_each(p) AS e
      WHERE NOT (e.key = ANY (private.codes_droits())) OR jsonb_typeof(e.value) <> 'boolean')
  END;
$function$;

-- Ancien role vers postes. Une valeur inconnue rend ARRAY[valeur] : le CHECK
-- des postes la refuse alors, ce qui est l'effet voulu.
CREATE OR REPLACE FUNCTION private.postes_depuis_role(p_role text) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = '' AS $function$
  SELECT CASE p_role
    WHEN 'super_admin' THEN '{}'::text[]
    WHEN 'admin' THEN ARRAY['manager']
    ELSE ARRAY[p_role]
  END;
$function$;

-- Postes vers role projete : le premier poste present dans l'ordre canonique.
CREATE OR REPLACE FUNCTION private.role_depuis_postes(p_postes text[]) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $function$
  SELECT c.poste
  FROM unnest(ARRAY['owner','manager','chef','cashier','bartender','reception',
                    'waiter','cook','crew','sales','production']) WITH ORDINALITY AS c(poste, rang)
  WHERE c.poste = ANY (p_postes)
  ORDER BY c.rang LIMIT 1;
$function$;

-- Ordre canonique, sans doublon. Une valeur inconnue est conservee en fin de
-- tableau pour que le CHECK la refuse (elle ne doit pas disparaitre en silence).
CREATE OR REPLACE FUNCTION private.postes_normalises(p text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = '' AS $function$
  SELECT coalesce(array_agg(x.poste ORDER BY x.rang, x.poste), '{}'::text[])
  FROM (
    SELECT DISTINCT u.poste,
           coalesce(array_position(ARRAY['owner','manager','chef','cashier','bartender','reception',
                                         'waiter','cook','crew','sales','production'], u.poste), 99) AS rang
    FROM unnest(coalesce(p, '{}'::text[])) AS u(poste)
  ) AS x;
$function$;

-- Traduction d'un reglage ecrit avec les 13 anciens codes (table B.5 de la
-- conception). Deux anciennes cles qui visent le meme nouveau code : le refus
-- gagne (bool_and). `orders.view` et `settings.view` n'ont pas d'equivalent.
-- Les lignes `refus_seulement` ne s'appliquent que si l'ancienne valeur est
-- false : retirer `orders.pay` retire aussi la remise et le remboursement.
CREATE OR REPLACE FUNCTION private.droits_depuis_anciens(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $function$
  SELECT CASE WHEN p IS NULL OR jsonb_typeof(p) <> 'object' THEN NULL ELSE coalesce((
    SELECT jsonb_object_agg(t.nouveau, t.valeur)
    FROM (
      SELECT m.nouveau, bool_and(e.value = 'true'::jsonb) AS valeur
      FROM jsonb_each(p) AS e
      JOIN (VALUES
        ('menu.view','menu.view',false), ('menu.edit','menu.edit',false), ('menu.edit','menu.price',false),
        ('orders.manage','orders.take',false), ('orders.manage','kitchen.track',false),
        ('orders.manage','orders.cancel',true), ('orders.manage','orders.discount',true),
        ('orders.manage','orders.refund',true),
        ('pos.use','orders.take',false),
        ('orders.pay','orders.pay',false), ('orders.pay','orders.discount',true), ('orders.pay','orders.refund',true),
        ('reports.view','reports.money',false), ('reports.view','reports.menu',false),
        ('inventory.view','inventory.view',false),
        ('inventory.edit','inventory.edit',false), ('inventory.edit','suppliers.manage',false),
        ('team.view','team.view',false), ('team.manage','team.manage',false),
        ('settings.edit','settings.edit',false)
      ) AS m(ancien, nouveau, refus_seulement) ON m.ancien = e.key
      WHERE jsonb_typeof(e.value) = 'boolean'
        AND (NOT m.refus_seulement OR e.value = 'false'::jsonb)
      GROUP BY m.nouveau
    ) AS t), '{}'::jsonb) END;
$function$;

-- Fusion d'une ecriture de l'ancien code dans un reglage au nouveau format.
-- Regle : une cle posee par le nouveau code n'est JAMAIS ecrasee ni retiree par
-- l'ancien. L'ancien code ne modifie qu'une cle absente, ou une cle dont la
-- valeur actuelle est exactement celle qu'il avait lui-meme produite.
--   p_actuel       : reglage actuel au nouveau format
--   p_ancien_avant : ancienne colonne avant l'ecriture (NULL a l'insertion)
--   p_ancien_apres : ancienne colonne apres l'ecriture (NULL ou '{}' a la suppression)
CREATE OR REPLACE FUNCTION private.fusion_anciens_droits(p_actuel jsonb, p_ancien_avant jsonb, p_ancien_apres jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = '' AS $function$
  WITH t AS (
    SELECT coalesce(p_actuel, '{}'::jsonb) AS actuel,
           coalesce(private.droits_depuis_anciens(p_ancien_avant), '{}'::jsonb) AS avant,
           coalesce(private.droits_depuis_anciens(p_ancien_apres), '{}'::jsonb) AS apres
  )
  SELECT nullif(
    ( t.actuel
      -- cles que l'ancien code retire : seulement si la valeur actuelle est la sienne
      - coalesce((SELECT array_agg(a.key) FROM jsonb_each(t.avant) AS a
                  WHERE NOT (t.apres ? a.key) AND (t.actuel -> a.key) = a.value), '{}'::text[]) )
    -- cles que l'ancien code pose ou change : seulement si absentes, ou si la valeur actuelle est la sienne
    || coalesce((SELECT jsonb_object_agg(n.key, n.value) FROM jsonb_each(t.apres) AS n
                 WHERE n.value IS DISTINCT FROM (t.avant -> n.key)
                   AND (NOT (t.actuel ? n.key)
                        OR (t.actuel -> n.key) IS NOT DISTINCT FROM (t.avant -> n.key))), '{}'::jsonb),
    '{}'::jsonb)
  FROM t;
$function$;

-- Privileges ecrits en clair pour chaque role, sans rien supposer des
-- privileges par defaut du schema (ils different entre la production, la CI et
-- un banc local). Seules `droits_valides` (CHECK evalues sous le role de
-- l'appelant) et `fusion_anciens_droits` (declencheur SECURITY INVOKER de
-- role_permissions) sont executables hors des fonctions SECURITY DEFINER.
REVOKE ALL ON FUNCTION private.codes_droits() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.matrice_postes() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.postes_depuis_role(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.role_depuis_postes(text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.postes_normalises(text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.droits_depuis_anciens(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.droits_valides(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.fusion_anciens_droits(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.droits_valides(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.fusion_anciens_droits(jsonb, jsonb, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. admin_users : plus de role par defaut, CHECK elargi, colonnes nouvelles
-- ---------------------------------------------------------------------------

-- Un INSERT qui oublie le role ET les postes echoue (NOT NULL) au lieu de creer
-- un administrateur complet.
ALTER TABLE public.admin_users ALTER COLUMN role DROP DEFAULT;

ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_role_check CHECK (role = ANY (ARRAY[
  'owner','admin','manager','cashier','chef','waiter','super_admin',
  'bartender','reception','cook','crew','sales','production']));

ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS postes text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS permission_overrides jsonb;

-- ---------------------------------------------------------------------------
-- 3. invitations : CHECK elargi, colonnes nouvelles
-- ---------------------------------------------------------------------------
-- Aucun grant de colonne a `authenticated` sur `postes` ni
-- `permission_overrides` (decision F4) : tout passe par le client de service.

ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_role_check CHECK (role = ANY (ARRAY[
  'admin','manager','cashier','chef','waiter',
  'bartender','reception','cook','crew','sales','production']));

ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS postes text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS permission_overrides jsonb;

-- ---------------------------------------------------------------------------
-- 3 bis. is_tenant_owner : ICI, apres la colonne `postes` qu'elle lit
--        (PostgreSQL valide le corps d'une fonction SQL a sa creation) et
--        avant les politiques de l'etape 4 qui l'appellent.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_tenant_owner(p_tenant uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT public.mfa_satisfait() AND EXISTS (
    SELECT 1 FROM public.admin_users AS au
    WHERE au.user_id = (SELECT auth.uid())
      AND au.tenant_id = p_tenant
      AND au.is_active IS TRUE
      AND au.deleted_at IS NULL
      AND 'owner' = ANY (au.postes));
$function$;
-- Aide de RLS : sans EXECUTE pour anon et authenticated, la RLS casse.
REVOKE ALL ON FUNCTION public.is_tenant_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tenant_owner(uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. poste_permissions : reglage par poste et par restaurant
-- ---------------------------------------------------------------------------
-- `owner` est exclu du CHECK : on ne regle pas le poste du proprietaire.
-- L'unicite (tenant_id, poste) sert d'index a la resolution et a l'isolation.
CREATE TABLE IF NOT EXISTS public.poste_permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  poste       text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  CONSTRAINT poste_permissions_tenant_poste_key UNIQUE (tenant_id, poste),
  CONSTRAINT poste_permissions_poste_check CHECK (poste = ANY (ARRAY[
    'manager','chef','cashier','bartender','reception','waiter','cook','crew','sales','production'])),
  CONSTRAINT poste_permissions_droits_check CHECK (private.droits_valides(permissions))
);
CREATE INDEX IF NOT EXISTS idx_poste_permissions_updated_by ON public.poste_permissions (updated_by);

ALTER TABLE public.poste_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.poste_permissions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.poste_permissions TO authenticated;
GRANT ALL ON public.poste_permissions TO service_role;

-- Lecture par tout membre (l'interface calcule ses propres droits), ecriture
-- par le seul proprietaire : regler les droits du personnel est un acte reserve.
DROP POLICY IF EXISTS poste_permissions_select ON public.poste_permissions;
CREATE POLICY poste_permissions_select ON public.poste_permissions FOR SELECT TO authenticated
  USING (tenant_id = ANY ((SELECT public.get_my_tenant_ids_array())::uuid[]));
DROP POLICY IF EXISTS poste_permissions_insert ON public.poste_permissions;
CREATE POLICY poste_permissions_insert ON public.poste_permissions FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_owner(tenant_id));
DROP POLICY IF EXISTS poste_permissions_update ON public.poste_permissions;
CREATE POLICY poste_permissions_update ON public.poste_permissions FOR UPDATE TO authenticated
  USING (public.is_tenant_owner(tenant_id)) WITH CHECK (public.is_tenant_owner(tenant_id));
DROP POLICY IF EXISTS poste_permissions_delete ON public.poste_permissions;
CREATE POLICY poste_permissions_delete ON public.poste_permissions FOR DELETE TO authenticated
  USING (public.is_tenant_owner(tenant_id));

-- ---------------------------------------------------------------------------
-- 5. Reprise des donnees existantes (avant les declencheurs de l'etape 6)
-- ---------------------------------------------------------------------------
-- `role = 'admin'` : gerant, plus le paiement de l'abonnement, pour que
-- l'ancien administrateur ne perde rien tant que l'ancien code le sert. Ce
-- reglage est retire par la contraction (MIG4, decision G.f).
UPDATE public.admin_users AS a
   SET postes = private.postes_depuis_role(a.role),
       permission_overrides = CASE
         WHEN a.role = 'admin' THEN
           coalesce(private.droits_depuis_anciens(a.custom_permissions), '{}'::jsonb)
             || '{"billing.manage": true}'::jsonb
         ELSE nullif(private.droits_depuis_anciens(a.custom_permissions), '{}'::jsonb)
       END
 WHERE a.postes = '{}';

UPDATE public.invitations AS i
   SET postes = private.postes_depuis_role(i.role),
       permission_overrides = CASE
         WHEN i.role = 'admin' THEN
           coalesce(private.droits_depuis_anciens(i.custom_permissions), '{}'::jsonb)
             || '{"billing.manage": true}'::jsonb
         ELSE nullif(private.droits_depuis_anciens(i.custom_permissions), '{}'::jsonb)
       END
 WHERE i.postes = '{}';

-- Les lignes `admin` de role_permissions ne sont PAS reprises : le role
-- disparait, et un reglage d'administrateur ne doit pas devenir celui du poste
-- Gerant. Leur nombre est rendu visible.
INSERT INTO public.poste_permissions (tenant_id, poste, permissions, updated_by)
SELECT rp.tenant_id, rp.role,
       coalesce(private.droits_depuis_anciens(rp.permissions), '{}'::jsonb), rp.updated_by
FROM public.role_permissions AS rp
WHERE rp.role <> 'admin'
ON CONFLICT (tenant_id, poste) DO NOTHING;

DO $reprise$
DECLARE
  v_admin int;
BEGIN
  SELECT count(*) INTO v_admin FROM public.role_permissions WHERE role = 'admin';
  RAISE NOTICE 'reprise des postes : % ligne(s) role_permissions du role admin non reprise(s)', v_admin;
END
$reprise$;

-- ---------------------------------------------------------------------------
-- 6. Declencheurs de synchronisation
-- ---------------------------------------------------------------------------
-- `postes` est la verite, `role` devient une projection. Le nom `aa_` fait
-- passer ce declencheur AVANT `garder_proprietaire_trg` (MIG3) et
-- `prevent_super_admin_elevation_trg`, qui voient donc les valeurs definitives.
CREATE OR REPLACE FUNCTION private.sync_postes_admin_users() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  NEW.postes := private.postes_normalises(NEW.postes);
  IF TG_OP = 'INSERT' THEN
    IF NEW.permission_overrides IS NULL AND NEW.custom_permissions IS NOT NULL THEN
      NEW.permission_overrides := private.fusion_anciens_droits(NULL, NULL, NEW.custom_permissions);
    END IF;
    IF cardinality(NEW.postes) = 0 THEN
      -- Ecriture a l'ancienne (role seul) : les postes sont deduits.
      NEW.postes := private.postes_depuis_role(NEW.role);
      IF NEW.role = 'admin' AND NOT (coalesce(NEW.permission_overrides, '{}'::jsonb) ? 'billing.manage') THEN
        NEW.permission_overrides := coalesce(NEW.permission_overrides, '{}'::jsonb) || '{"billing.manage": true}'::jsonb;
      END IF;
    ELSIF NEW.role IS DISTINCT FROM 'super_admin' THEN
      NEW.role := private.role_depuis_postes(NEW.postes);
    END IF;
    RETURN NEW;
  END IF;

  -- Ecriture de l'ancien code : FUSION, jamais remplacement. Une cle posee par
  -- le nouveau code n'est ni ecrasee ni retiree.
  IF NEW.custom_permissions IS DISTINCT FROM OLD.custom_permissions
     AND NEW.permission_overrides IS NOT DISTINCT FROM OLD.permission_overrides THEN
    NEW.permission_overrides := private.fusion_anciens_droits(
      OLD.permission_overrides, OLD.custom_permissions, NEW.custom_permissions);
  END IF;
  IF NEW.postes IS DISTINCT FROM OLD.postes THEN
    -- Si `postes` et `role` changent ensemble, `postes` gagne.
    IF NEW.role IS DISTINCT FROM 'super_admin' AND cardinality(NEW.postes) > 0 THEN
      NEW.role := private.role_depuis_postes(NEW.postes);
    END IF;
  ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
    NEW.postes := private.postes_depuis_role(NEW.role);
    IF NEW.role = 'admin' AND NOT (coalesce(NEW.permission_overrides, '{}'::jsonb) ? 'billing.manage') THEN
      NEW.permission_overrides := coalesce(NEW.permission_overrides, '{}'::jsonb) || '{"billing.manage": true}'::jsonb;
    ELSIF OLD.role = 'admin' THEN
      NEW.permission_overrides := nullif(coalesce(NEW.permission_overrides, '{}'::jsonb) - 'billing.manage', '{}'::jsonb);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.sync_postes_admin_users() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS aa_admin_users_sync_postes ON public.admin_users;
CREATE TRIGGER aa_admin_users_sync_postes BEFORE INSERT OR UPDATE ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION private.sync_postes_admin_users();

-- Meme corps pour les invitations, sans les deux tests `super_admin` (une
-- invitation ne porte jamais ce role).
CREATE OR REPLACE FUNCTION private.sync_postes_invitations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  NEW.postes := private.postes_normalises(NEW.postes);
  IF TG_OP = 'INSERT' THEN
    IF NEW.permission_overrides IS NULL AND NEW.custom_permissions IS NOT NULL THEN
      NEW.permission_overrides := private.fusion_anciens_droits(NULL, NULL, NEW.custom_permissions);
    END IF;
    IF cardinality(NEW.postes) = 0 THEN
      NEW.postes := private.postes_depuis_role(NEW.role);
      IF NEW.role = 'admin' AND NOT (coalesce(NEW.permission_overrides, '{}'::jsonb) ? 'billing.manage') THEN
        NEW.permission_overrides := coalesce(NEW.permission_overrides, '{}'::jsonb) || '{"billing.manage": true}'::jsonb;
      END IF;
    ELSE
      NEW.role := private.role_depuis_postes(NEW.postes);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.custom_permissions IS DISTINCT FROM OLD.custom_permissions
     AND NEW.permission_overrides IS NOT DISTINCT FROM OLD.permission_overrides THEN
    NEW.permission_overrides := private.fusion_anciens_droits(
      OLD.permission_overrides, OLD.custom_permissions, NEW.custom_permissions);
  END IF;
  IF NEW.postes IS DISTINCT FROM OLD.postes THEN
    IF cardinality(NEW.postes) > 0 THEN
      NEW.role := private.role_depuis_postes(NEW.postes);
    END IF;
  ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
    NEW.postes := private.postes_depuis_role(NEW.role);
    IF NEW.role = 'admin' AND NOT (coalesce(NEW.permission_overrides, '{}'::jsonb) ? 'billing.manage') THEN
      NEW.permission_overrides := coalesce(NEW.permission_overrides, '{}'::jsonb) || '{"billing.manage": true}'::jsonb;
    ELSIF OLD.role = 'admin' THEN
      NEW.permission_overrides := nullif(coalesce(NEW.permission_overrides, '{}'::jsonb) - 'billing.manage', '{}'::jsonb);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.sync_postes_invitations() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS aa_invitations_sync_postes ON public.invitations;
CREATE TRIGGER aa_invitations_sync_postes BEFORE INSERT OR UPDATE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION private.sync_postes_invitations();

-- Report des ecritures de l'ancien code dans role_permissions.
--   SECURITY INVOKER, voulu : `authenticated` a GRANT ALL sur role_permissions.
--   En DEFINER, toute ecriture admise un jour dans l'ancienne table deviendrait
--   une ecriture dans poste_permissions sans passer par sa garde. En INVOKER le
--   report est soumis a la RLS de poste_permissions (is_tenant_owner, donc
--   aussi la double authentification) : qui n'a pas le droit d'ecrire la
--   nouvelle table voit son ecriture dans l'ancienne echouer en entier.
--   La ligne `admin` n'est JAMAIS reportee (admin et manager visent le meme
--   poste). Fusion, jamais remplacement. Une suppression ne retire que les
--   cles que l'ancien code avait lui-meme posees, jamais la ligne.
CREATE OR REPLACE FUNCTION public.role_permissions_vers_postes() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role IN ('manager', 'cashier', 'chef', 'waiter') THEN
      UPDATE public.poste_permissions AS pp
         SET permissions = coalesce(
               private.fusion_anciens_droits(pp.permissions, OLD.permissions, '{}'::jsonb), '{}'::jsonb),
             updated_at = now()
       WHERE pp.tenant_id = OLD.tenant_id AND pp.poste = OLD.role;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.role NOT IN ('manager', 'cashier', 'chef', 'waiter') THEN
    RETURN NEW;   -- 'admin' : jamais reporte
  END IF;

  INSERT INTO public.poste_permissions AS pp (tenant_id, poste, permissions, updated_by)
  VALUES (NEW.tenant_id, NEW.role,
          coalesce(private.fusion_anciens_droits(NULL, NULL, NEW.permissions), '{}'::jsonb),
          NEW.updated_by)
  ON CONFLICT (tenant_id, poste) DO UPDATE
    SET permissions = coalesce(private.fusion_anciens_droits(
                        pp.permissions,
                        CASE WHEN TG_OP = 'UPDATE' THEN OLD.permissions END,
                        NEW.permissions), '{}'::jsonb),
        updated_at = now(),
        updated_by = EXCLUDED.updated_by;
  RETURN NEW;
END;
$function$;
-- Dans `public` parce qu'un declencheur INVOKER execute son corps avec les
-- droits de l'appelant. Appelable par personne en direct.
REVOKE ALL ON FUNCTION public.role_permissions_vers_postes() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS role_permissions_vers_postes ON public.role_permissions;
CREATE TRIGGER role_permissions_vers_postes AFTER INSERT OR UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.role_permissions_vers_postes();

-- ---------------------------------------------------------------------------
-- 7. Contraintes et index uniques (apres la reprise : les lignes sont pretes)
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_postes_check;
ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_postes_check CHECK (postes <@ ARRAY[
  'owner','manager','chef','cashier','bartender','reception','waiter','cook','crew','sales','production']);
ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_postes_non_vide;
ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_postes_non_vide CHECK (
  cardinality(postes) >= 1 OR role = 'super_admin' OR is_super_admin IS TRUE);
ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_overrides_check;
ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_overrides_check CHECK (
  permission_overrides IS NULL OR private.droits_valides(permission_overrides));

-- `owner` n'est jamais invitable.
ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_postes_check;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_postes_check CHECK (postes <@ ARRAY[
  'manager','chef','cashier','bartender','reception','waiter','cook','crew','sales','production']);
ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_postes_non_vide;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_postes_non_vide CHECK (cardinality(postes) >= 1);
ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_overrides_check;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_overrides_check CHECK (
  permission_overrides IS NULL OR private.droits_valides(permission_overrides));

-- Un seul proprietaire vivant par restaurant.
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_un_proprietaire
  ON public.admin_users (tenant_id) WHERE 'owner' = ANY (postes) AND deleted_at IS NULL;
-- Une seule ligne vivante par personne et par restaurant : la resolution lit UNE ligne.
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_tenant_user_vivant
  ON public.admin_users (tenant_id, user_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 8. accept_invitation_membership : copie aussi les deux nouvelles colonnes
-- ---------------------------------------------------------------------------
-- Corps de schema.sql, avec `postes` et `permission_overrides` ajoutes a
-- l'INSERT. Le declencheur projette `role` depuis `postes` : une invitation
-- `admin` acceptee donne un gerant (role `manager`), jamais un administrateur.
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
    user_id, tenant_id, email, full_name, role, is_active, custom_permissions,
    postes, permission_overrides, created_by
  ) VALUES (
    p_user_id, v_inv.tenant_id, v_inv.email,
    COALESCE(NULLIF(trim(p_full_name), ''), v_inv.email),
    v_inv.role, true, v_inv.custom_permissions,
    v_inv.postes, v_inv.permission_overrides, v_inv.invited_by
  );

  UPDATE invitations SET status = 'accepted', accepted_at = now() WHERE id = v_inv.id;

  SELECT slug INTO v_slug FROM tenants WHERE id = v_inv.tenant_id;

  RETURN jsonb_build_object('tenantId', v_inv.tenant_id, 'tenantSlug', COALESCE(v_slug, ''));
END;
$function$;

COMMIT;
