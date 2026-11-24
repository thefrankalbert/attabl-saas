-- ============================================================================
-- Verification de mise en production du 2026-11-24, test du module de stock,
-- constat 5 (Moyenne). La lecture DIRECTE des donnees de stock suit la meme
-- regle que les pages: le droit `inventory.view`.
--
-- CE QUI NE TENAIT PAS. Avec son jeton, un serveur ou un caissier lisait par
-- PostgREST `ingredients` (63 produits, couts), `stock_movements` (4725
-- mouvements avec leurs auteurs) et `suppliers` (17 fournisseurs, telephones,
-- e-mails): les politiques SELECT ne demandaient que l'appartenance au
-- restaurant (`get_my_tenant_ids_array()`). Les pages de stock leur sont
-- pourtant refusees (`admin-route-permissions.ts`: inventory.view), et les
-- fonctions de lecture du stock exigent deja `inventory.view` depuis
-- 20261124150700. Pas de fuite entre restaurants.
--
-- LA CORRECTION.
-- 1. `get_my_inventory_tenant_ids()`: les restaurants ou l'appelant a
--    `inventory.view` OU `inventory.edit`, calcules par
--    `has_tenant_write_permission` (meme resolution que les ecrans: role,
--    surcharge du role, surcharge individuelle, membre actif). Depend de la
--    branche `inventory.view` posee par 20261124150700 (proprietaire, admin,
--    gerant et chef par defaut, pas le caissier ni le serveur). `inventory.edit`
--    est ajoute pour qu'un employe a qui le proprietaire n'aurait donne que
--    l'ecriture puisse encore relire les lignes qu'il modifie (un UPDATE
--    PostgREST filtre et renvoie des lignes: il exige aussi la politique
--    SELECT). La fonction rend un tableau evalue UNE fois par requete
--    (`(SELECT ...)` en initplan), pas un appel par ligne: 4725 mouvements ne
--    coutent qu'un calcul. Elle garde EXECUTE pour `anon` et `authenticated`
--    (fonction d'aide de politique RLS).
-- 2. Les politiques SELECT de `ingredients`, `stock_movements`, `suppliers`
--    l'utilisent, et aussi celles de `stock_counts`, `stock_count_lines` et
--    `recipes`: memes ecrans (Inventaire, Comptages, Fiches techniques), meme
--    regle; les lignes de comptage portent le stock theorique et les fiches
--    techniques les quantites. Politiques reservees a `authenticated`:
--    `anon` n'a plus de politique et lit 0 ligne (il ne lisait deja rien).
--
-- INVENTAIRE DES LECTEURS (src/, lu le 2026-11-24, client utilisateur):
-- - pages Inventaire, Comptages, Fiches techniques, Fournisseurs, Historique,
--   Pertes, Rapport de stock: toutes gardees par `inventory.view`;
-- - imports de fiches et de fournisseurs: `inventory.edit`;
-- - tableau de bord (`admin/page.tsx`, `useDashboardStats.ts`): lit des
--   produits en stock bas pour TOUT role, mais ces donnees ne sont rendues
--   nulle part (`initialStockAlerts` et `stockItems` non affiches). Pour le
--   caissier et le serveur la requete renvoie desormais un tableau vide, sans
--   erreur; l'abonnement temps reel du tableau de bord sur `ingredients` ne
--   leur envoie plus d'evenement. Rien de visible ne change;
-- - caisse, cuisine, service, disponibilite des plats: ne lisent pas ces
--   tables (la disponibilite est `menu_items.is_available`, tenue par
--   `sync_menu_availability`, SECURITY DEFINER);
-- - vente (`create_order_with_items`, `destock_order`), crons de rappels et
--   alertes de stock: SECURITY DEFINER ou client service_role, non vises.
--
-- ORDRE DE DEPLOIEMENT: RETIRE un acces (lecture du caissier et du serveur).
-- Aucun code en ligne n'en depend pour un affichage: applicable avant ou
-- apres le deploiement du code. Prerequis: 20261124150700 (deja en production).
--
-- ROLLBACK: recreer les six politiques
--   CREATE POLICY "<nom d'origine>" ON public.<table> FOR SELECT TO public
--     USING (tenant_id = ANY (public.get_my_tenant_ids_array()));
-- (noms d'origine: "Admins can view own tenant ingredients", "Admins can view
-- own tenant stock_movements", "Admins can view own tenant suppliers",
-- stock_counts_select, stock_count_lines_select, "Admins can view own tenant
-- recipes"), supprimer les nouvelles, puis
--   DROP FUNCTION IF EXISTS public.get_my_inventory_tenant_ids();
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_inventory_tenant_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT au.tenant_id), '{}')
  FROM public.admin_users au
  WHERE au.user_id = (SELECT auth.uid())
    AND (public.has_tenant_write_permission(au.tenant_id, 'inventory.view')
         OR public.has_tenant_write_permission(au.tenant_id, 'inventory.edit'));
$function$;

REVOKE ALL ON FUNCTION public.get_my_inventory_tenant_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_inventory_tenant_ids() TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Admins can view own tenant ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "Inventory viewers can view own tenant ingredients" ON public.ingredients;
CREATE POLICY "Inventory viewers can view own tenant ingredients" ON public.ingredients
  FOR SELECT TO authenticated
  USING (tenant_id = ANY ((SELECT public.get_my_inventory_tenant_ids())::uuid[]));

DROP POLICY IF EXISTS "Admins can view own tenant stock_movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Inventory viewers can view own tenant stock_movements" ON public.stock_movements;
CREATE POLICY "Inventory viewers can view own tenant stock_movements" ON public.stock_movements
  FOR SELECT TO authenticated
  USING (tenant_id = ANY ((SELECT public.get_my_inventory_tenant_ids())::uuid[]));

DROP POLICY IF EXISTS "Admins can view own tenant suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Inventory viewers can view own tenant suppliers" ON public.suppliers;
CREATE POLICY "Inventory viewers can view own tenant suppliers" ON public.suppliers
  FOR SELECT TO authenticated
  USING (tenant_id = ANY ((SELECT public.get_my_inventory_tenant_ids())::uuid[]));

DROP POLICY IF EXISTS stock_counts_select ON public.stock_counts;
DROP POLICY IF EXISTS "Inventory viewers can view own tenant stock_counts" ON public.stock_counts;
CREATE POLICY "Inventory viewers can view own tenant stock_counts" ON public.stock_counts
  FOR SELECT TO authenticated
  USING (tenant_id = ANY ((SELECT public.get_my_inventory_tenant_ids())::uuid[]));

DROP POLICY IF EXISTS stock_count_lines_select ON public.stock_count_lines;
DROP POLICY IF EXISTS "Inventory viewers can view own tenant stock_count_lines" ON public.stock_count_lines;
CREATE POLICY "Inventory viewers can view own tenant stock_count_lines" ON public.stock_count_lines
  FOR SELECT TO authenticated
  USING (tenant_id = ANY ((SELECT public.get_my_inventory_tenant_ids())::uuid[]));

DROP POLICY IF EXISTS "Admins can view own tenant recipes" ON public.recipes;
DROP POLICY IF EXISTS "Inventory viewers can view own tenant recipes" ON public.recipes;
CREATE POLICY "Inventory viewers can view own tenant recipes" ON public.recipes
  FOR SELECT TO authenticated
  USING (tenant_id = ANY ((SELECT public.get_my_inventory_tenant_ids())::uuid[]));

COMMIT;
