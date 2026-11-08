-- ============================================================================
-- LOT 3 - Les ECRITURES restantes ne regardaient que l'APPARTENANCE
-- ============================================================================
--
-- SUITE DE 20261107100000 (catalogue) ET 20261107120000 (argent). Ces deux
-- migrations ont ferme `menu_items`, `categories`, `menus`, `tables`, `orders`,
-- `order_items`, `payments` et `tenants`. Elles disaient explicitement ne pas
-- traiter le reste. Voici le reste.
--
-- MESURE, PAS SUPPOSITION (2026-11-07). Base jetable `rls_lot3` montee sur
-- l'instantane du schema de prod (`supabase/schema.sql`, 51 tables, 143
-- policies - identique au banc) PUIS les cinq migrations posterieures, dont
-- les deux ci-dessus. Etat obtenu verifie conforme a la prod:
--
--   fonction_garde=1  avec_garde_total=18
--
-- Sur cette base, le recensement des policies d'ecriture (ALL/INSERT/UPDATE/
-- DELETE) dont l'expression ne mentionne NI le role NI la fonction de garde
-- donne 74 policies sur 35 tables. Toutes ne sont pas des defauts: les
-- policies `service_role_full_access*`, `*_service_only` et celles qui
-- bornent un utilisateur a SES propres lignes (`push_subscriptions`,
-- `user_preferences`, `user_sessions`, `notifications`, `onboarding_progress`)
-- sont correctes telles quelles. Cette migration traite les 20 tables qui
-- portent des DONNEES METIER DU RESTAURANT ecrivables par n'importe quel
-- membre, quel que soit son role.
--
-- CE QUE CELA PERMETTAIT CONCRETEMENT. Un employe de role `waiter`, avec la
-- seule cle anon du bundle et son propre compte, atteint PostgREST
-- directement - les Server Actions ne gardent pas PostgREST. Il pouvait donc
-- reecrire une recette, creer un fournisseur, modifier un inventaire, ouvrir
-- ou solder un compte maison (de l'argent), changer les reglages du
-- restaurant ou supprimer une zone. Les gardes de role existaient, mais
-- seulement dans les Server Actions.
--
-- LA REGLE APPLIQUEE N'EST PAS INVENTEE. Elle est relevee une par une dans
-- les Server Actions qui ecrivent chaque table:
--
--   menu.edit       announcements.ts, coupons.ts, modifiers.ts, suggestions.ts,
--                   ads.ts, menu-items.ts (variantes de prix)
--   inventory.edit  inventory.ts (ingredients, mouvements, recettes),
--                   suppliers.ts, stock-count.ts
--   orders.manage   house-accounts.ts, orders.ts (notes de commande),
--                   assignments.ts, tables.ts (zones)
--   settings.edit   venues.ts, tenant-settings.ts, qr-design.ts,
--                   venues.ts (supports)
--
-- La base dit desormais la meme chose que l'application.
--
-- PIEGE EVITE - LA LECTURE (lecon de 20261107100000). Retirer une policy
-- `ALL` retire aussi la LECTURE qu'elle accordait. Sur six tables, la seule
-- autre policy SELECT est publique et FILTRE les lignes, ou il n'y en a
-- aucune:
--
--   coupons, settings                    aucune policy SELECT -> le personnel
--                                        ne verrait plus RIEN
--   announcements, venues                SELECT = `is_active = true` -> on ne
--                                        pourrait plus reactiver un element
--                                        desactive, on ne le verrait plus
--   item_modifiers, item_price_variants  SELECT = anon sur les plats
--                                        disponibles -> le personnel perdrait
--                                        la vue sur les plats indisponibles
--
-- Chaque `ALL` retiree sur ces tables est donc remplacee par DEUX choses: une
-- policy SELECT pour les membres (appartenance seule, exactement l'ancienne
-- condition - tout le personnel continue de tout lire), et des policies
-- d'ecriture qui verifient le role.
--
-- PIEGE EVITE - LE OU LOGIQUE. Plusieurs tables portent a la fois une `ALL`
-- permissive ET des policies par commande plus faibles (sous-requete
-- `admin_users` qui ne verifie meme pas `is_active`). Deux policies
-- permissives sont un OU: en laisser une seule en place annule tout le
-- resserrage. Toutes les policies d'ecriture permissives de chaque table
-- traitee sont donc retirees, pas seulement la `ALL`.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS, ET POURQUOI:
--
--   admin_users           porte `Block super_admin escalation by non-super-
--                         admins`, une garde d'escalade de privileges. La
--                         toucher demande sa propre analyse: s'y tromper
--                         ouvre l'escalade qu'elle ferme.
--   table_sessions        chemin chaud du service (ouverture/fermeture de
--                         table en salle). Merite son propre lot, comme
--                         `orders` a eu le sien.
--   order_mutation_requests  le role EST le sujet de cette table (un serveur
--                         demande, un gerant approuve). Y poser une garde de
--                         role sans modeler les deux cotes de ce flux
--                         casserait la demande elle-meme.
--   restaurant_groups     ecrite par restaurant-group.service depuis
--                         venues.ts ET depuis /api/restaurants/create, qui
--                         n'imposent pas la meme permission. A trancher avant
--                         de choisir.
--   stock_alert_notifs    ecrite par notification.service, cote serveur. Le
--                         role de l'appelant n'est pas la bonne question ici.
--   item_options,         AUCUN ecrivain dans `src` (presentes seulement dans
--   dish_photo_drafts     les types generes). Les resserrer serait du bruit;
--                         elles meritent surtout d'etre supprimees si elles
--                         sont vraiment mortes.
--
-- La fonction de garde `public.has_tenant_write_permission(uuid, text)` est
-- celle de 20261107100000. Elle n'est PAS redefinie ici: on la reutilise.
--
-- ROLLBACK: voir le bloc en fin de fichier.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. announcements  (menu.edit)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage announcements" ON public.announcements;
DROP POLICY IF EXISTS "Admins can delete own tenant announcements" ON public.announcements;
DROP POLICY IF EXISTS "Admins can manage own tenant announcements" ON public.announcements;
DROP POLICY IF EXISTS "Admins can update own tenant announcements" ON public.announcements;

-- Compensation de lecture: la seule autre policy SELECT est `is_active = true`.
CREATE POLICY "Members can read own tenant announcements"
  ON public.announcements
  FOR SELECT
  USING (tenant_id = ANY (get_my_tenant_ids_array()));

CREATE POLICY "Menu managers can insert own tenant announcements"
  ON public.announcements
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(announcements.tenant_id, 'menu.edit'));

CREATE POLICY "Menu managers can update own tenant announcements"
  ON public.announcements
  FOR UPDATE
  USING (public.has_tenant_write_permission(announcements.tenant_id, 'menu.edit'))
  WITH CHECK (public.has_tenant_write_permission(announcements.tenant_id, 'menu.edit'));

CREATE POLICY "Menu managers can delete own tenant announcements"
  ON public.announcements
  FOR DELETE
  USING (public.has_tenant_write_permission(announcements.tenant_id, 'menu.edit'));

-- ---------------------------------------------------------------------------
-- 2. coupons  (menu.edit)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage own tenant coupons" ON public.coupons;

-- Compensation de lecture: cette table n'avait AUCUNE autre policy SELECT.
CREATE POLICY "Members can read own tenant coupons"
  ON public.coupons
  FOR SELECT
  USING (tenant_id = ANY (get_my_tenant_ids_array()));

CREATE POLICY "Menu managers can insert own tenant coupons"
  ON public.coupons
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(coupons.tenant_id, 'menu.edit'));

CREATE POLICY "Menu managers can update own tenant coupons"
  ON public.coupons
  FOR UPDATE
  USING (public.has_tenant_write_permission(coupons.tenant_id, 'menu.edit'))
  WITH CHECK (public.has_tenant_write_permission(coupons.tenant_id, 'menu.edit'));

CREATE POLICY "Menu managers can delete own tenant coupons"
  ON public.coupons
  FOR DELETE
  USING (public.has_tenant_write_permission(coupons.tenant_id, 'menu.edit'));

-- ---------------------------------------------------------------------------
-- 3. item_modifiers  (menu.edit)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Item modifiers manageable by admins" ON public.item_modifiers;

-- Compensation de lecture: la seule autre policy SELECT est anon, bornee aux
-- plats disponibles et non supprimes.
CREATE POLICY "Members can read own tenant item modifiers"
  ON public.item_modifiers
  FOR SELECT
  USING (tenant_id = ANY (get_my_tenant_ids_array()));

CREATE POLICY "Menu managers can insert own tenant item modifiers"
  ON public.item_modifiers
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(item_modifiers.tenant_id, 'menu.edit'));

CREATE POLICY "Menu managers can update own tenant item modifiers"
  ON public.item_modifiers
  FOR UPDATE
  USING (public.has_tenant_write_permission(item_modifiers.tenant_id, 'menu.edit'))
  WITH CHECK (public.has_tenant_write_permission(item_modifiers.tenant_id, 'menu.edit'));

CREATE POLICY "Menu managers can delete own tenant item modifiers"
  ON public.item_modifiers
  FOR DELETE
  USING (public.has_tenant_write_permission(item_modifiers.tenant_id, 'menu.edit'));

-- ---------------------------------------------------------------------------
-- 4. item_price_variants  (menu.edit)
-- ---------------------------------------------------------------------------
-- DEUX policies ALL permissives ici: les deux doivent partir (OU logique).
DROP POLICY IF EXISTS "Admins can manage price variants" ON public.item_price_variants;
DROP POLICY IF EXISTS "Admins manage own tenant price variants" ON public.item_price_variants;

-- Compensation de lecture: la seule autre policy SELECT est anon, bornee aux
-- plats disponibles.
CREATE POLICY "Members can read own tenant price variants"
  ON public.item_price_variants
  FOR SELECT
  USING (tenant_id = ANY (get_my_tenant_ids_array()));

CREATE POLICY "Menu managers can insert own tenant price variants"
  ON public.item_price_variants
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(item_price_variants.tenant_id, 'menu.edit'));

CREATE POLICY "Menu managers can update own tenant price variants"
  ON public.item_price_variants
  FOR UPDATE
  USING (public.has_tenant_write_permission(item_price_variants.tenant_id, 'menu.edit'))
  WITH CHECK (public.has_tenant_write_permission(item_price_variants.tenant_id, 'menu.edit'));

CREATE POLICY "Menu managers can delete own tenant price variants"
  ON public.item_price_variants
  FOR DELETE
  USING (public.has_tenant_write_permission(item_price_variants.tenant_id, 'menu.edit'));

-- ---------------------------------------------------------------------------
-- 5. item_suggestions  (menu.edit)
-- ---------------------------------------------------------------------------
-- La ALL plus trois policies par commande dont la sous-requete ne verifie pas
-- `is_active`: tout part.
DROP POLICY IF EXISTS "Admins can manage own tenant item_suggestions" ON public.item_suggestions;
DROP POLICY IF EXISTS "item_suggestions_insert" ON public.item_suggestions;
DROP POLICY IF EXISTS "item_suggestions_update" ON public.item_suggestions;
DROP POLICY IF EXISTS "item_suggestions_delete" ON public.item_suggestions;

-- Lecture deja couverte par "Admins can view own tenant item_suggestions".
CREATE POLICY "Menu managers can insert own tenant item_suggestions"
  ON public.item_suggestions
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(item_suggestions.tenant_id, 'menu.edit'));

CREATE POLICY "Menu managers can update own tenant item_suggestions"
  ON public.item_suggestions
  FOR UPDATE
  USING (public.has_tenant_write_permission(item_suggestions.tenant_id, 'menu.edit'))
  WITH CHECK (public.has_tenant_write_permission(item_suggestions.tenant_id, 'menu.edit'));

CREATE POLICY "Menu managers can delete own tenant item_suggestions"
  ON public.item_suggestions
  FOR DELETE
  USING (public.has_tenant_write_permission(item_suggestions.tenant_id, 'menu.edit'));

-- ---------------------------------------------------------------------------
-- 6. ads  (menu.edit)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage own tenant ads" ON public.ads;
DROP POLICY IF EXISTS "Admins can update own tenant ads" ON public.ads;
DROP POLICY IF EXISTS "Admins can delete own tenant ads" ON public.ads;

-- Lecture deja couverte par "Admins can view own tenant ads" (authenticated).
CREATE POLICY "Menu managers can insert own tenant ads"
  ON public.ads
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(ads.tenant_id, 'menu.edit'));

CREATE POLICY "Menu managers can update own tenant ads"
  ON public.ads
  FOR UPDATE
  USING (public.has_tenant_write_permission(ads.tenant_id, 'menu.edit'))
  WITH CHECK (public.has_tenant_write_permission(ads.tenant_id, 'menu.edit'));

CREATE POLICY "Menu managers can delete own tenant ads"
  ON public.ads
  FOR DELETE
  USING (public.has_tenant_write_permission(ads.tenant_id, 'menu.edit'));

-- ---------------------------------------------------------------------------
-- 7. ingredients  (inventory.edit)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage own tenant ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "ingredients_insert" ON public.ingredients;
DROP POLICY IF EXISTS "ingredients_update" ON public.ingredients;

-- Lecture deja couverte par "Admins can view own tenant ingredients".
CREATE POLICY "Inventory managers can insert own tenant ingredients"
  ON public.ingredients
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(ingredients.tenant_id, 'inventory.edit'));

CREATE POLICY "Inventory managers can update own tenant ingredients"
  ON public.ingredients
  FOR UPDATE
  USING (public.has_tenant_write_permission(ingredients.tenant_id, 'inventory.edit'))
  WITH CHECK (public.has_tenant_write_permission(ingredients.tenant_id, 'inventory.edit'));

CREATE POLICY "Inventory managers can delete own tenant ingredients"
  ON public.ingredients
  FOR DELETE
  USING (public.has_tenant_write_permission(ingredients.tenant_id, 'inventory.edit'));

-- ---------------------------------------------------------------------------
-- 8. recipes  (inventory.edit)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage own tenant recipes" ON public.recipes;
DROP POLICY IF EXISTS "recipes_insert" ON public.recipes;
DROP POLICY IF EXISTS "recipes_update" ON public.recipes;
DROP POLICY IF EXISTS "recipes_delete" ON public.recipes;

-- Lecture deja couverte par "Admins can view own tenant recipes".
CREATE POLICY "Inventory managers can insert own tenant recipes"
  ON public.recipes
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(recipes.tenant_id, 'inventory.edit'));

CREATE POLICY "Inventory managers can update own tenant recipes"
  ON public.recipes
  FOR UPDATE
  USING (public.has_tenant_write_permission(recipes.tenant_id, 'inventory.edit'))
  WITH CHECK (public.has_tenant_write_permission(recipes.tenant_id, 'inventory.edit'));

CREATE POLICY "Inventory managers can delete own tenant recipes"
  ON public.recipes
  FOR DELETE
  USING (public.has_tenant_write_permission(recipes.tenant_id, 'inventory.edit'));

-- ---------------------------------------------------------------------------
-- 9. suppliers  (inventory.edit)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage own tenant suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_insert" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_update" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_delete" ON public.suppliers;

-- Lecture deja couverte par "Admins can view own tenant suppliers".
CREATE POLICY "Inventory managers can insert own tenant suppliers"
  ON public.suppliers
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(suppliers.tenant_id, 'inventory.edit'));

CREATE POLICY "Inventory managers can update own tenant suppliers"
  ON public.suppliers
  FOR UPDATE
  USING (public.has_tenant_write_permission(suppliers.tenant_id, 'inventory.edit'))
  WITH CHECK (public.has_tenant_write_permission(suppliers.tenant_id, 'inventory.edit'));

CREATE POLICY "Inventory managers can delete own tenant suppliers"
  ON public.suppliers
  FOR DELETE
  USING (public.has_tenant_write_permission(suppliers.tenant_id, 'inventory.edit'));

-- ---------------------------------------------------------------------------
-- 10. stock_movements  (inventory.edit)
-- ---------------------------------------------------------------------------
-- Journal de mouvements: pas d'UPDATE ni de DELETE a autoriser, seul l'ajout.
DROP POLICY IF EXISTS "Admins can manage own tenant stock_movements" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_insert" ON public.stock_movements;

-- Lecture deja couverte par "Admins can view own tenant stock_movements".
CREATE POLICY "Inventory managers can insert own tenant stock_movements"
  ON public.stock_movements
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(stock_movements.tenant_id, 'inventory.edit'));

-- ---------------------------------------------------------------------------
-- 11. stock_counts  (inventory.edit)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "stock_counts_insert" ON public.stock_counts;
DROP POLICY IF EXISTS "stock_counts_update" ON public.stock_counts;
DROP POLICY IF EXISTS "stock_counts_delete" ON public.stock_counts;

-- Lecture deja couverte par "stock_counts_select".
CREATE POLICY "Inventory managers can insert own tenant stock_counts"
  ON public.stock_counts
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(stock_counts.tenant_id, 'inventory.edit'));

CREATE POLICY "Inventory managers can update own tenant stock_counts"
  ON public.stock_counts
  FOR UPDATE
  USING (public.has_tenant_write_permission(stock_counts.tenant_id, 'inventory.edit'))
  WITH CHECK (public.has_tenant_write_permission(stock_counts.tenant_id, 'inventory.edit'));

CREATE POLICY "Inventory managers can delete own tenant stock_counts"
  ON public.stock_counts
  FOR DELETE
  USING (public.has_tenant_write_permission(stock_counts.tenant_id, 'inventory.edit'));

-- ---------------------------------------------------------------------------
-- 12. stock_count_lines  (inventory.edit)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "stock_count_lines_insert" ON public.stock_count_lines;
DROP POLICY IF EXISTS "stock_count_lines_update" ON public.stock_count_lines;
DROP POLICY IF EXISTS "stock_count_lines_delete" ON public.stock_count_lines;

-- Lecture deja couverte par "stock_count_lines_select".
CREATE POLICY "Inventory managers can insert own tenant stock_count_lines"
  ON public.stock_count_lines
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(stock_count_lines.tenant_id, 'inventory.edit'));

CREATE POLICY "Inventory managers can update own tenant stock_count_lines"
  ON public.stock_count_lines
  FOR UPDATE
  USING (public.has_tenant_write_permission(stock_count_lines.tenant_id, 'inventory.edit'))
  WITH CHECK (public.has_tenant_write_permission(stock_count_lines.tenant_id, 'inventory.edit'));

CREATE POLICY "Inventory managers can delete own tenant stock_count_lines"
  ON public.stock_count_lines
  FOR DELETE
  USING (public.has_tenant_write_permission(stock_count_lines.tenant_id, 'inventory.edit'));

-- ---------------------------------------------------------------------------
-- 13. house_accounts  (orders.manage) - DE L'ARGENT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "house_accounts_tenant_insert" ON public.house_accounts;
DROP POLICY IF EXISTS "house_accounts_tenant_update" ON public.house_accounts;
DROP POLICY IF EXISTS "house_accounts_tenant_delete" ON public.house_accounts;

-- Lecture deja couverte par "house_accounts_tenant_select".
CREATE POLICY "Order managers can insert own tenant house_accounts"
  ON public.house_accounts
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(house_accounts.tenant_id, 'orders.manage'));

CREATE POLICY "Order managers can update own tenant house_accounts"
  ON public.house_accounts
  FOR UPDATE
  USING (public.has_tenant_write_permission(house_accounts.tenant_id, 'orders.manage'))
  WITH CHECK (public.has_tenant_write_permission(house_accounts.tenant_id, 'orders.manage'));

CREATE POLICY "Order managers can delete own tenant house_accounts"
  ON public.house_accounts
  FOR DELETE
  USING (public.has_tenant_write_permission(house_accounts.tenant_id, 'orders.manage'));

-- ---------------------------------------------------------------------------
-- 14. order_notes  (orders.manage)
-- ---------------------------------------------------------------------------
-- Table en AJOUT SEUL: elle n'avait ni UPDATE ni DELETE, et cette forme est
-- voulue (une note de commande ne se reecrit pas). On n'en ajoute pas.
DROP POLICY IF EXISTS "order_notes_tenant_insert" ON public.order_notes;

-- Lecture deja couverte par "order_notes_tenant_select".
CREATE POLICY "Order managers can insert own tenant order_notes"
  ON public.order_notes
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(order_notes.tenant_id, 'orders.manage'));

-- ---------------------------------------------------------------------------
-- 15. table_assignments  (orders.manage)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant members can insert assignments" ON public.table_assignments;
DROP POLICY IF EXISTS "Tenant members can update assignments" ON public.table_assignments;
DROP POLICY IF EXISTS "Tenant members can delete assignments" ON public.table_assignments;

-- Lecture deja couverte par "Tenant members can view assignments".
-- L'ancienne policy UPDATE n'avait PAS de WITH CHECK: la nouvelle en a un,
-- sinon une ligne modifiee peut sortir du perimetre autorise.
CREATE POLICY "Order managers can insert own tenant assignments"
  ON public.table_assignments
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(table_assignments.tenant_id, 'orders.manage'));

CREATE POLICY "Order managers can update own tenant assignments"
  ON public.table_assignments
  FOR UPDATE
  USING (public.has_tenant_write_permission(table_assignments.tenant_id, 'orders.manage'))
  WITH CHECK (public.has_tenant_write_permission(table_assignments.tenant_id, 'orders.manage'));

CREATE POLICY "Order managers can delete own tenant assignments"
  ON public.table_assignments
  FOR DELETE
  USING (public.has_tenant_write_permission(table_assignments.tenant_id, 'orders.manage'));

-- ---------------------------------------------------------------------------
-- 16. zones  (orders.manage)
-- ---------------------------------------------------------------------------
-- Les zones sont ecrites par table-config.service, appele depuis tables.ts,
-- qui impose `orders.manage` - la meme permission que les tables elles-memes.
DROP POLICY IF EXISTS "Admins can manage zones" ON public.zones;

-- Lecture deja couverte par "Members can view own tenant zones".
CREATE POLICY "Order managers can insert own tenant zones"
  ON public.zones
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(zones.tenant_id, 'orders.manage'));

CREATE POLICY "Order managers can update own tenant zones"
  ON public.zones
  FOR UPDATE
  USING (public.has_tenant_write_permission(zones.tenant_id, 'orders.manage'))
  WITH CHECK (public.has_tenant_write_permission(zones.tenant_id, 'orders.manage'));

CREATE POLICY "Order managers can delete own tenant zones"
  ON public.zones
  FOR DELETE
  USING (public.has_tenant_write_permission(zones.tenant_id, 'orders.manage'));

-- ---------------------------------------------------------------------------
-- 17. venues  (settings.edit)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage own tenant venues" ON public.venues;

-- Compensation de lecture: la seule autre policy SELECT est `is_active = true`
-- (publique). Sans celle-ci, on ne pourrait plus reactiver un etablissement
-- desactive: on ne le verrait plus du tout.
CREATE POLICY "Members can read own tenant venues"
  ON public.venues
  FOR SELECT
  USING (tenant_id = ANY (get_my_tenant_ids_array()));

CREATE POLICY "Settings managers can insert own tenant venues"
  ON public.venues
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(venues.tenant_id, 'settings.edit'));

CREATE POLICY "Settings managers can update own tenant venues"
  ON public.venues
  FOR UPDATE
  USING (public.has_tenant_write_permission(venues.tenant_id, 'settings.edit'))
  WITH CHECK (public.has_tenant_write_permission(venues.tenant_id, 'settings.edit'));

CREATE POLICY "Settings managers can delete own tenant venues"
  ON public.venues
  FOR DELETE
  USING (public.has_tenant_write_permission(venues.tenant_id, 'settings.edit'));

-- ---------------------------------------------------------------------------
-- 18. settings  (settings.edit)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage their restaurant settings" ON public.settings;

-- Compensation de lecture: cette table n'avait AUCUNE autre policy SELECT.
CREATE POLICY "Members can read own tenant settings"
  ON public.settings
  FOR SELECT
  USING (tenant_id = ANY (get_my_tenant_ids_array()));

CREATE POLICY "Settings managers can insert own tenant settings"
  ON public.settings
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(settings.tenant_id, 'settings.edit'));

CREATE POLICY "Settings managers can update own tenant settings"
  ON public.settings
  FOR UPDATE
  USING (public.has_tenant_write_permission(settings.tenant_id, 'settings.edit'))
  WITH CHECK (public.has_tenant_write_permission(settings.tenant_id, 'settings.edit'));

CREATE POLICY "Settings managers can delete own tenant settings"
  ON public.settings
  FOR DELETE
  USING (public.has_tenant_write_permission(settings.tenant_id, 'settings.edit'));

-- ---------------------------------------------------------------------------
-- 19. qr_designs  (settings.edit)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant members can insert qr designs" ON public.qr_designs;
DROP POLICY IF EXISTS "Tenant members can update qr designs" ON public.qr_designs;
DROP POLICY IF EXISTS "Tenant members can delete qr designs" ON public.qr_designs;

-- Lecture deja couverte par "Tenant members can view qr designs".
CREATE POLICY "Settings managers can insert own tenant qr designs"
  ON public.qr_designs
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(qr_designs.tenant_id, 'settings.edit'));

CREATE POLICY "Settings managers can update own tenant qr designs"
  ON public.qr_designs
  FOR UPDATE
  USING (public.has_tenant_write_permission(qr_designs.tenant_id, 'settings.edit'))
  WITH CHECK (public.has_tenant_write_permission(qr_designs.tenant_id, 'settings.edit'));

CREATE POLICY "Settings managers can delete own tenant qr designs"
  ON public.qr_designs
  FOR DELETE
  USING (public.has_tenant_write_permission(qr_designs.tenant_id, 'settings.edit'));

-- ---------------------------------------------------------------------------
-- 20. tenant_supports  (settings.edit)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenant_supports_insert" ON public.tenant_supports;
DROP POLICY IF EXISTS "tenant_supports_update" ON public.tenant_supports;
DROP POLICY IF EXISTS "tenant_supports_delete" ON public.tenant_supports;

-- Lecture deja couverte par "tenant_supports_select".
CREATE POLICY "Settings managers can insert own tenant supports"
  ON public.tenant_supports
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(tenant_supports.tenant_id, 'settings.edit'));

CREATE POLICY "Settings managers can update own tenant supports"
  ON public.tenant_supports
  FOR UPDATE
  USING (public.has_tenant_write_permission(tenant_supports.tenant_id, 'settings.edit'))
  WITH CHECK (public.has_tenant_write_permission(tenant_supports.tenant_id, 'settings.edit'));

CREATE POLICY "Settings managers can delete own tenant supports"
  ON public.tenant_supports
  FOR DELETE
  USING (public.has_tenant_write_permission(tenant_supports.tenant_id, 'settings.edit'));

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Retirer les policies posees ici et remettre les anciennes. A n'utiliser que
-- si un role legitime se retrouve bloque en production ET que le correctif
-- applicatif n'est pas immediat: ce rollback REOUVRE l'ecriture a tout membre
-- du restaurant, quel que soit son role.
--
-- Les noms des anciennes policies et leurs conditions exactes sont dans
-- `supabase/schema.sql` (instantane du schema de prod). Pour chaque table
-- traitee ci-dessus:
--
--   1. DROP les policies creees ici (noms en "Menu managers ...",
--      "Inventory managers ...", "Order managers ...", "Settings managers ...",
--      et les "Members can read own tenant ..." de compensation);
--   2. recreer la policy ALL d'origine, telle qu'elle figure dans schema.sql.
--
-- Exemple pour coupons:
--   DROP POLICY IF EXISTS "Menu managers can insert own tenant coupons" ON public.coupons;
--   DROP POLICY IF EXISTS "Menu managers can update own tenant coupons" ON public.coupons;
--   DROP POLICY IF EXISTS "Menu managers can delete own tenant coupons" ON public.coupons;
--   DROP POLICY IF EXISTS "Members can read own tenant coupons" ON public.coupons;
--   CREATE POLICY "Admins can manage own tenant coupons" ON public.coupons
--     FOR ALL USING (tenant_id = ANY (get_my_tenant_ids_array()))
--     WITH CHECK (tenant_id = ANY (get_my_tenant_ids_array()));
-- ============================================================================
