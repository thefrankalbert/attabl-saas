-- ============================================================================
-- La matrice de la base rejoint celle du produit, et les montants deviennent
-- non reecrivables apres creation
-- ============================================================================
--
-- CE QUE CETTE MIGRATION REMPLACE. Une version precedente de ce fichier
-- (`20261107210000_delegation_pas_sur_les_commandes.sql`) retirait
-- `orders.manage` de la delegation, faute de savoir fermer autrement le chemin
-- des montants. Elle n'a ete appliquee dans AUCUN environnement, et elle etait
-- FAUSSE: elle contredisait le produit, qui documente explicitement dans
-- `src/lib/admin-roles.ts` qu'un caissier detient `orders.manage` et qu'une
-- garde plus etroite que la matrice est un defaut deja vecu ("la caisse ne
-- pouvait pas faire avancer une commande"). Elle est donc supprimee, pas
-- corrigee: cette migration fait le travail a sa place.
--
-- ----------------------------------------------------------------------------
-- 1. DEUX ECARTS MESURES ENTRE LA MATRICE DE L'APP ET CELLE DE LA BASE
-- ----------------------------------------------------------------------------
--
-- La garde `has_tenant_write_permission` n'est interrogee que pour quatre
-- permissions (`menu.edit`, `orders.manage`, `inventory.edit`,
-- `settings.edit`). Son defaut etait `admin` ou `manager` pour les quatre, ce
-- qui divergeait de `DEFAULT_PERMISSIONS` (src/types/permission.types.ts), la
-- source de verite de l'application, dans LES DEUX SENS:
--
--   | permission      | l'app accorde a                  | la base accordait a      |
--   | --------------- | -------------------------------- | ------------------------ |
--   | menu.edit       | owner, admin, manager            | owner, admin, manager    |
--   | inventory.edit  | owner, admin, manager            | owner, admin, manager    |
--   | orders.manage   | owner, admin, manager, cashier,  | owner, admin, manager    |
--   |                 | chef                             | <- LA CAISSE MANQUAIT    |
--   | settings.edit   | owner, admin                     | owner, admin, manager    |
--   |                 |                                  | <- PLUS PERMISSIF        |
--
-- Consequences MESUREES des deux ecarts:
--
--   a) `orders.manage`: un caissier encaissait depuis l'ecran POS
--      (`/api/orders/pos` ecrit avec le client admin, donc hors RLS) mais
--      etait REFUSE en encaissant depuis la note (`actionRecordTender` ecrit
--      avec le jeton de l'employe, donc sous RLS, et `payments_tenant_insert`
--      exige `orders.manage`). La caisse etait a moitie cassee en production
--      depuis l'application de `20261107120000`.
--
--   b) `settings.edit`: un gerant pouvait ecrire les reglages du restaurant
--      directement par l'API alors que l'application le lui refuse. L'ecart
--      allait donc dans le sens d'une PERMISSION DE TROP.
--
-- Le defaut devient donc la matrice du produit, permission par permission. Le
-- `owner` n'atteint jamais ce bloc (il est court-circuite au-dessus). Une
-- permission inconnue de cette liste garde l'ancien defaut `admin`/`manager`:
-- la garde n'est aujourd'hui appelee qu'avec les quatre ci-dessus, et refuser
-- l'inconnu casserait tout futur appel au lieu de le proteger.
--
-- CONTRE LA DERIVE: `supabase/tests/rls/garde_argent.test.sql` epingle cette
-- matrice role par role. Si quelqu'un modifie `DEFAULT_PERMISSIONS` sans
-- toucher ici, le test tombe.
--
-- ----------------------------------------------------------------------------
-- 2. POURQUOI LES MONTANTS DOIVENT ETRE PROTEGES EN MEME TEMPS
-- ----------------------------------------------------------------------------
--
-- Rendre `orders.manage` au caissier rouvre le chemin trouve par la revue de
-- securite: les gardes argent de `20261107190000` et `20261107200000` portent
-- sur le LIBELLE d'une commande (`payment_status`, `is_comp`), pas sur ses
-- MONTANTS. Un caissier pouvait donc poser `total = 0` sur une note existante
-- puis l'encaisser: l'effet economique d'un offert, obtenu par une autre
-- colonne, en contournant la garde de l'offert. Aucune policy ne peut fermer
-- ce chemin: une policy ne lit pas les colonnes MODIFIEES, seulement la ligne
-- resultante, et une note a legitimement un total variable.
--
-- Les deux moities arrivent donc dans UNE SEULE migration, donc une seule
-- transaction. Les separer laisserait, entre les deux, une fenetre ou la
-- caisse est rendue au caissier sans que les montants soient proteges.
--
-- POURQUOI `current_user` ET PAS `auth.role()`. Mesure faite sur une vraie
-- stack Supabase locale portant le schema de production:
--
--   | contexte                            | current_user  |
--   | ----------------------------------- | ------------- |
--   | employe connecte (jeton utilisateur)| authenticated |
--   | convive non connecte                | anon          |
--   | caisse POS (client service_role)    | service_role  |
--   | dans une fonction SECURITY DEFINER  | postgres      |
--   | migration, maintenance              | postgres      |
--
-- Tester `current_user` exempte donc AUTOMATIQUEMENT la caisse POS, les
-- chemins SECURITY DEFINER (`record_refund`) et les migrations, et ne
-- contraint que les deux roles joignables par un client. C'est un mecanisme
-- Postgres pur: il ne depend pas du schema `auth`, dont une base jetable ne
-- donne qu'un ersatz - c'est precisement ce qui avait empeche de valider ce
-- declencheur la premiere fois.
--
-- La liste des roles contraints est POSITIVE (`authenticated`, `anon`) et non
-- une liste d'exemptions. Raison: l'attaque passe par PostgREST avec un jeton,
-- et PostgREST ne bascule que vers ces deux roles. Tout autre `current_user`
-- signifie que l'appel a deja traverse du code de confiance. Une liste
-- d'exemptions attraperait au contraire les roles internes de Supabase
-- (replication, `supabase_admin`) et casserait des operations de plateforme.
--
-- `tip_amount` reste ECRIVABLE: c'est la seule colonne d'argent qu'un chemin
-- applicatif modifie apres creation (`order-lifecycle.ts`, `markPaid`). Verifie
-- avant d'ecrire ce declencheur: aucun chemin applicatif n'ecrit `total`,
-- `subtotal`, `discount_amount` ni `service_charge_amount` sur une commande
-- existante, et aucun declencheur ne recalcule les totaux (ajouter un plat ne
-- reecrit donc pas `total`). Refuser ces quatre colonnes ne retire aucune
-- capacite qui fonctionne.
--
-- Le refus LEVE (`42501`) au lieu de masquer la ligne: un declencheur
-- BEFORE UPDATE qui retournerait NULL annulerait l'ecriture en silence, et un
-- encaissement silencieusement perdu est pire qu'un refus visible.
--
-- ----------------------------------------------------------------------------
-- 3. LA CONFIGURATION DE SALLE DOIT SUIVRE, SINON LA SECTION 1 ELEVE UN
--    PRIVILEGE
-- ----------------------------------------------------------------------------
--
-- Neuf policies de `tables`, `zones` et `table_assignments` sont gardees par
-- `orders.manage` seul, alors que l'application exige EN PLUS la liste de
-- roles de gestion. Rendre `orders.manage` au caissier sans toucher a ces
-- policies lui ouvrirait la suppression de tables et de zones par l'API.
-- Detail et justification du nouveau garde: voir la section 3 du corps.
--
-- LES TROIS SECTIONS SONT INDISSOCIABLES. Chacune seule introduit un defaut:
--   1 seule -> le caissier peut remettre les montants a zero, et supprimer des
--              tables et des zones;
--   2 seule -> la caisse du caissier reste cassee en production;
--   3 seule -> aucun effet utile.
-- Elles arrivent donc dans UNE migration, donc une seule transaction.
--
-- ROLLBACK (dans cet ordre):
--   DROP TRIGGER IF EXISTS trg_montants_commande_non_reecrits ON public.orders;
--   DROP FUNCTION IF EXISTS public.refuser_reecriture_montants_commande();
--   -- reposer les 9 policies de salle sur
--   --   has_tenant_write_permission(tenant_id, 'orders.manage')
--   -- avec leurs anciens noms ("Order managers can ..." / "Table managers
--   -- can ..."), puis DROP FUNCTION public.has_tenant_floor_permission(uuid);
--   -- enfin reposer le corps de 20261107170000 (defaut admin/manager partout).
--   -- ATTENTION: cela recasse la caisse du caissier ET rouvre `total = 0`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. La matrice par defaut de la base rejoint celle du produit
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_tenant_write_permission(p_tenant uuid, p_perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
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
             -- Puis la surcharge de role posee par le proprietaire pour ce
             -- tenant, qui tranche aussi dans les deux sens.
             WHEN rp.permissions ? p_perm
               THEN (rp.permissions -> p_perm) = 'true'::jsonb
             -- Sans aucune surcharge: la matrice du produit
             -- (DEFAULT_PERMISSIONS, src/types/permission.types.ts).
             ELSE CASE p_perm
                    WHEN 'orders.manage'
                      THEN au.role = ANY (ARRAY['admin', 'manager', 'cashier', 'chef'])
                    WHEN 'settings.edit'
                      THEN au.role = 'admin'
                    WHEN 'menu.edit'
                      THEN au.role = ANY (ARRAY['admin', 'manager'])
                    WHEN 'inventory.edit'
                      THEN au.role = ANY (ARRAY['admin', 'manager'])
                    -- Permission hors des quatre que la base interroge: on
                    -- garde l'ancien defaut plutot que de casser l'appel.
                    ELSE au.role = ANY (ARRAY['admin', 'manager'])
                  END
           END
      )
  );
$$;

-- CREATE OR REPLACE preserve les grants EXECUTE existants. On les repose quand
-- meme: un helper RLS qui perd `anon` ou `authenticated` ne durcit pas la RLS,
-- il la casse.
GRANT EXECUTE ON FUNCTION public.has_tenant_write_permission(uuid, text)
  TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Les montants d'une commande ne se reecrivent pas apres sa creation
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refuser_reecriture_montants_commande()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER est ESSENTIEL: en SECURITY DEFINER, `current_user` vaudrait
-- toujours le proprietaire de la fonction et la garde ne se declencherait
-- JAMAIS. C'est la difference entre un declencheur qui protege et un
-- declencheur decoratif.
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Seuls les deux roles joignables par un client sont contraints. Voir
  -- l'en-tete pour la mesure de `current_user` dans chaque contexte.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.total IS DISTINCT FROM OLD.total
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
     OR NEW.service_charge_amount IS DISTINCT FROM OLD.service_charge_amount
  THEN
    RAISE EXCEPTION
      'Les montants d''une commande ne se reecrivent pas apres sa creation'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_montants_commande_non_reecrits ON public.orders;
CREATE TRIGGER trg_montants_commande_non_reecrits
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.refuser_reecriture_montants_commande();

-- ----------------------------------------------------------------------------
-- 3. La configuration de salle reste au gerant
-- ----------------------------------------------------------------------------
--
-- POURQUOI CETTE SECTION FAIT PARTIE DU MEME CHANGEMENT. Neuf policies de
-- `tables`, `zones` et `table_assignments` sont gardees par
-- `has_tenant_write_permission(tenant_id, 'orders.manage')`. Or l'application
-- garde ces memes surfaces par une liste de roles GROSSIERE *en plus* de la
-- permission fine:
--
--   src/app/actions/tables.ts       ['owner', 'admin', 'manager'] + 'orders.manage'
--   src/app/actions/assignments.ts  ['owner', 'admin', 'manager'] + 'orders.manage'
--
-- Tant que le defaut de la base n'accordait `orders.manage` qu'a admin/manager,
-- les deux coincidaient PAR ACCIDENT. La section 1 rend `orders.manage` au
-- caissier et au chef: sans cette section, un caissier pourrait creer et
-- SUPPRIMER des tables et des zones en appelant l'API directement, alors que
-- l'application le lui refuse. Livrer la section 1 seule introduirait donc une
-- elevation de privilege - c'est pourquoi les trois sections sont
-- indissociables.
--
-- POURQUOI UN NOUVEAU GARDE ET PAS `has_tenant_money_permission`. Ce dernier a
-- exactement le meme corps aujourd'hui (role de gestion ET `orders.manage`), et
-- le reutiliser serait tentant. Mais il signifie "cette personne peut engager
-- de l'argent". Confondre les deux ferait qu'un futur changement des regles
-- d'argent deplacerait en silence qui configure la salle. Deux noms pour deux
-- intentions.
--
-- Les policies SELECT ne sont PAS touchees: lire le plan de salle reste ouvert
-- aux membres, et le personnel en a besoin pour servir.

CREATE OR REPLACE FUNCTION public.has_tenant_floor_permission(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = (SELECT auth.uid())
      AND au.tenant_id = p_tenant
      AND (au.is_active IS NULL OR au.is_active = true)
      AND au.deleted_at IS NULL
      AND au.role = ANY (ARRAY['owner', 'admin', 'manager'])
  )
  AND public.has_tenant_write_permission(p_tenant, 'orders.manage');
$$;

-- Un helper RLS qui perd `anon` ou `authenticated` ne durcit pas la RLS, il la
-- casse: les policies s'evaluent alors en erreur de permission.
GRANT EXECUTE ON FUNCTION public.has_tenant_floor_permission(uuid)
  TO anon, authenticated, service_role;

-- zones
DROP POLICY IF EXISTS "Order managers can insert own tenant zones" ON public.zones;
DROP POLICY IF EXISTS "Order managers can update own tenant zones" ON public.zones;
DROP POLICY IF EXISTS "Order managers can delete own tenant zones" ON public.zones;

CREATE POLICY "Floor managers can insert own tenant zones"
  ON public.zones
  FOR INSERT
  WITH CHECK (public.has_tenant_floor_permission(zones.tenant_id));

CREATE POLICY "Floor managers can update own tenant zones"
  ON public.zones
  FOR UPDATE
  USING (public.has_tenant_floor_permission(zones.tenant_id))
  WITH CHECK (public.has_tenant_floor_permission(zones.tenant_id));

CREATE POLICY "Floor managers can delete own tenant zones"
  ON public.zones
  FOR DELETE
  USING (public.has_tenant_floor_permission(zones.tenant_id));

-- tables
DROP POLICY IF EXISTS "Table managers can insert own tenant tables" ON public.tables;
DROP POLICY IF EXISTS "Table managers can update own tenant tables" ON public.tables;
DROP POLICY IF EXISTS "Table managers can delete own tenant tables" ON public.tables;

CREATE POLICY "Floor managers can insert own tenant tables"
  ON public.tables
  FOR INSERT
  WITH CHECK (public.has_tenant_floor_permission(tables.tenant_id));

CREATE POLICY "Floor managers can update own tenant tables"
  ON public.tables
  FOR UPDATE
  USING (public.has_tenant_floor_permission(tables.tenant_id))
  WITH CHECK (public.has_tenant_floor_permission(tables.tenant_id));

CREATE POLICY "Floor managers can delete own tenant tables"
  ON public.tables
  FOR DELETE
  USING (public.has_tenant_floor_permission(tables.tenant_id));

-- table_assignments
DROP POLICY IF EXISTS "Order managers can insert own tenant assignments" ON public.table_assignments;
DROP POLICY IF EXISTS "Order managers can update own tenant assignments" ON public.table_assignments;
DROP POLICY IF EXISTS "Order managers can delete own tenant assignments" ON public.table_assignments;

CREATE POLICY "Floor managers can insert own tenant assignments"
  ON public.table_assignments
  FOR INSERT
  WITH CHECK (public.has_tenant_floor_permission(table_assignments.tenant_id));

CREATE POLICY "Floor managers can update own tenant assignments"
  ON public.table_assignments
  FOR UPDATE
  USING (public.has_tenant_floor_permission(table_assignments.tenant_id))
  WITH CHECK (public.has_tenant_floor_permission(table_assignments.tenant_id));

CREATE POLICY "Floor managers can delete own tenant assignments"
  ON public.table_assignments
  FOR DELETE
  USING (public.has_tenant_floor_permission(table_assignments.tenant_id));
