-- ============================================================================
-- La garde d'ecriture IGNORAIT les delegations du proprietaire
-- ============================================================================
--
-- MESURE, PAS SUPPOSITION (2026-11-07, base jetable au schema de prod + les
-- cinq migrations posterieures, donc l'etat SERVI aujourd'hui):
--
--   un proprietaire accorde `inventory.edit` a son chef, et `orders.manage` a
--   son caissier, par l'interface des permissions du produit. Puis:
--
--   select has_tenant_write_permission('<tenant>', 'inventory.edit');  -- chef
--   -> f
--   select has_tenant_write_permission('<tenant>', 'orders.manage');   -- caissier
--   -> f
--   -- temoin, meme requete pour le gerant -> t  (la sonde est valide)
--
-- CAUSE. `has_tenant_write_permission`, posee par 20261107100000, ne consulte
-- `custom_permissions` et `role_permissions` que pour les roles `admin` et
-- `manager`, et seulement pour REFUSER davantage:
--
--   au.role = 'owner'
--   OR ( au.role = ANY (ARRAY['admin','manager']) AND <pas refuse explicitement> )
--
-- Un `cashier`, un `chef` ou un `waiter` n'atteint donc jamais la lecture des
-- surcharges: il est refuse avant. Or `/api/permissions` accepte precisement
-- ces trois roles (`VALID_ROLES = ['admin','manager','cashier','chef',
-- 'waiter']`). L'interface de delegation du produit dit donc oui, et la base
-- dit non.
--
-- CE QUE CELA DONNAIT A L'UTILISATEUR. Le proprietaire delegue la gestion des
-- stocks a son chef, l'ecran confirme, et l'ecriture est refusee par la base.
-- Sur un UPDATE, RLS ne leve AUCUNE erreur: elle masque la ligne. Selon
-- l'appelant, cela se voit donc comme "rien ne se passe" ou comme un message
-- trompeur. La fonctionnalite de delegation etait donc inoperante pour les
-- trois roles qu'elle est censee servir.
--
-- LE CORRECTIF. La garde consulte desormais les surcharges pour TOUT role, et
-- ne retombe sur `admin`/`manager` qu'en l'ABSENCE de surcharge explicite:
--
--   - `owner`                     -> toujours vrai (inchange, comme hasPermission);
--   - surcharge individuelle      -> honoree (vrai sauf 'false');
--   - surcharge de role du tenant -> honoree (vrai sauf 'false');
--   - aucune surcharge            -> `admin`/`manager` seulement, exactement
--                                    le comportement actuel.
--
-- Donc: AUCUN elargissement pour un role sans surcharge. Le seul changement de
-- comportement est le cas ou le proprietaire a explicitement accorde la
-- permission - ce qui est le but de la fonctionnalite.
--
-- CE QUE CE CORRECTIF NE FAIT PAS, ET POURQUOI. La matrice PAR DEFAUT reste
-- inconnue de la base. Elle accorde `orders.manage` au `cashier` et au `chef`
-- SANS surcharge: ces deux roles restent donc refuses par la base sur les
-- ecritures de commande tant qu'aucune delegation explicite n'est posee.
-- Recopier la matrice par defaut en SQL exigerait de choisir entre DEUX
-- sources qui se CONTREDISENT aujourd'hui dans le depot:
--
--   src/lib/permissions.ts         ROLE_PERMISSIONS.cashier.canManageOrders = false
--   src/types/permission.types.ts  DEFAULT_PERMISSIONS.cashier['orders.manage'] = true
--
-- Trancher laquelle fait foi est une decision produit, pas une decision de
-- migration. Elle est documentee pour etre prise, pas contournee ici.
--
-- POURQUOI LIRE `custom_permissions` N'OUVRE PAS UNE ESCALADE. Cette fonction
-- traite une colonne de `admin_users` comme une source d'autorisation. Si un
-- employe pouvait l'ecrire sur sa propre ligne, il s'accorderait n'importe
-- quelle permission - et la policy `Members update their own admin row`
-- autorise bien un membre a modifier SA ligne. Le verrou n'est donc pas la
-- policy, il est au niveau des COLONNES, pose par
-- 20261105000000_admin_users_revoke_write_authenticated. Mesure sur une base
-- au schema de prod:
--
--   privileges UPDATE de `authenticated` sur admin_users:
--     full_name, last_login, last_login_at, login_count, phone
--
--   un waiter tentant `update admin_users set custom_permissions =
--   '{"menu.edit":true}' where id = <sa propre ligne>`
--     -> ERROR: permission denied for table admin_users
--
-- Ni `custom_permissions` ni `role` ne sont dans la liste blanche. Le chemin
-- est ferme, et il l'est par des privileges de colonne, pas par une policy -
-- donc une future policy laxiste ne le rouvrirait pas. CONSEQUENCE A TENIR:
-- ajouter `custom_permissions` ou `role` a cette liste blanche rouvrirait
-- l'escalade pour tous les roles, cette fois.
--
-- COMPARAISON STRICTE. La version d'origine testait `(... ->> p_perm) <>
-- 'false'`, donc toute valeur autre que la chaine 'false' accordait la
-- permission - y compris `null`, `0`, `""` ou un objet. `/api/permissions`
-- n'ecrit que des booleens (`z.record(z.enum(PERMISSION_CODES), z.boolean())`),
-- donc la comparaison stricte `= 'true'::jsonb` ne change RIEN pour les
-- donnees legitimes; elle ferme seulement l'ambiguite si une valeur non
-- booleenne arrivait par un autre chemin (migration, edition manuelle,
-- ecrivain futur plus laxiste).
--
-- ROLLBACK: reposer la definition de 20261107100000 (le CASE y est imbrique
-- dans la branche admin/manager au lieu de la preceder).
-- ============================================================================

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
             -- Sans aucune surcharge: comportement d'origine inchange.
             ELSE au.role = ANY (ARRAY['admin', 'manager'])
           END
      )
  );
$$;

-- CREATE OR REPLACE preserve les grants EXECUTE existants (verifie sur ce
-- depot). On les repose quand meme: un helper RLS qui perd `anon` ou
-- `authenticated` ne durcit pas la RLS, il la casse.
GRANT EXECUTE ON FUNCTION public.has_tenant_write_permission(uuid, text)
  TO anon, authenticated, service_role;
