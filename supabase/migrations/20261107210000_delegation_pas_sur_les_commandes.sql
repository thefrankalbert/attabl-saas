-- ============================================================================
-- La delegation ne porte PAS sur orders.manage
-- ============================================================================
--
-- POURQUOI CE RESSERRAGE, APRES AVOIR OUVERT LA DELEGATION. 20261107170000 a
-- rendu la garde sensible aux delegations du proprietaire, ce qui reparait une
-- fonctionnalite inoperante. 20261107190000 et 20261107200000 ont ensuite
-- ferme, l'un apres l'autre, les chemins par lesquels une delegation de
-- `orders.manage` atteignait de l'argent: montant negatif, statut 'refunded',
-- offert a l'insertion, suppression d'une note.
--
-- La revue de securite a trouve un chemin de plus, et celui-la ne se ferme pas
-- par une policy. MESURE: la garde argent verifie le LIBELLE d'une commande
-- (`payment_status`, `is_comp`), pas ses MONTANTS. Un caissier porteur d'une
-- delegation `orders.manage` pouvait donc mettre `total = 0` sur une note
-- existante et l'encaisser: l'effet economique d'un offert, obtenu par une
-- autre colonne, en contournant la garde de l'offert.
--
-- POURQUOI PAS UN DECLENCHEUR NI UN REVOKE DE COLONNES. Les deux remedes
-- habituels sont ici des instruments plus dangereux que le defaut:
--
--   - un declencheur BEFORE UPDATE comparant OLD et NEW doit EXEMPTER
--     `service_role` (la caisse ecrit avec le client admin) et les chemins
--     SECURITY DEFINER (`record_refund`). Cette exemption depend de l'identite
--     de role, et elle n'a PAS pu etre validee sur une base jetable: le schema
--     `auth` y est un ersatz dont les privileges diffferent de la production.
--     Se tromper fait echouer les ecritures de la caisse en prod.
--   - `authenticated` porte un privilege UPDATE DE TABLE sur `orders`, en plus
--     des privileges de colonne. Un REVOKE cible ne suffit donc pas: il
--     faudrait retirer l'UPDATE de table puis re-accorder la liste exacte des
--     colonnes que l'application ecrit. Une seule colonne oubliee empeche le
--     restaurant de servir.
--
-- CE QUI EST FAIT A LA PLACE, ET POURQUOI C'EST COHERENT. La garde cesse
-- d'honorer une delegation pour `orders.manage` precisement. Consequence: un
-- `cashier`, un `chef` ou un `waiter` n'obtient JAMAIS d'ecriture sur les
-- commandes par delegation, donc aucun des chemins ci-dessus n'est atteignable
-- - y compris celui des montants, qu'aucune policy ne savait fermer.
--
-- Ce n'est pas un recul: c'est l'etat SERVI aujourd'hui en production, et il
-- rejoint une question produit non tranchee. Les deux matrices du depot se
-- CONTREDISENT sur ce point precis:
--
--   src/lib/permissions.ts         ROLE_PERMISSIONS.cashier.canManageOrders = false
--   src/types/permission.types.ts  DEFAULT_PERMISSIONS.cashier['orders.manage'] = true
--
-- Deleguer l'ecriture des commandes a un caissier demande d'abord de savoir
-- laquelle fait foi, puis de proteger les montants. Les deux sont des
-- decisions, pas des details de migration.
--
-- CE QUI CONTINUE DE FONCTIONNER. La delegation reste pleinement honoree pour
-- `menu.edit`, `inventory.edit`, `settings.edit` et les autres permissions -
-- c'est le cas mesure qui motivait 20261107170000: un chef a qui le
-- proprietaire accorde `inventory.edit` gere bien ses stocks. Seules les
-- ecritures de commande sont exclues.
--
-- Les gardes posees par 20261107190000 et 20261107200000 RESTENT en place.
-- Elles ne sont plus le seul rempart, mais elles valent comme defense en
-- profondeur: le jour ou la delegation de `orders.manage` sera ouverte
-- volontairement, elles seront deja la.
--
-- ROLLBACK: reposer la definition de 20261107170000 (sans la clause
-- `p_perm <> 'orders.manage'`). Cela REOUVRE le chemin des montants.
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
             -- Les ecritures de commande ne se DELEGUENT PAS: la garde argent
             -- verifie le libelle d'une commande, pas ses montants, et aucune
             -- policy ne sait fermer le chemin `total = 0`. Voir l'en-tete.
             WHEN p_perm = 'orders.manage'
               THEN au.role = ANY (ARRAY['admin', 'manager'])
                    -- Une delegation n'ACCORDE pas, mais un RETRAIT explicite
                    -- retire toujours: sans ce bloc, un gerant a qui le
                    -- proprietaire a retire `orders.manage` repasserait.
                    AND CASE
                          WHEN au.custom_permissions ? p_perm
                            THEN (au.custom_permissions -> p_perm) = 'true'::jsonb
                          WHEN rp.permissions ? p_perm
                            THEN (rp.permissions -> p_perm) = 'true'::jsonb
                          ELSE true
                        END
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

GRANT EXECUTE ON FUNCTION public.has_tenant_write_permission(uuid, text)
  TO anon, authenticated, service_role;
