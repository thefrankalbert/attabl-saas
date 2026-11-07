-- ============================================================================
-- Les ECRITURES du catalogue ne regardaient que l'APPARTENANCE, jamais le ROLE
-- ============================================================================
--
-- MESURE, PAS SUPPOSITION (2026-11-07, base locale au schema du projet):
-- un employe de role `waiter`, avec la seule cle anon du bundle et son propre
-- compte, a fait passer un plat de 10 000 a 1,00 en attaquant PostgREST
-- directement:
--
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<son uuid>","role":"authenticated"}';
--   update menu_items set price = 1 where id = '<un plat de son restaurant>';
--   -- lignes modifiees: 1
--
-- CAUSE. Chaque table du catalogue portait une policy `FOR ALL` dont la
-- condition etait l'appartenance seule (`tenant_id = ANY
-- (get_my_tenant_ids_array())`). Elle accorde donc INSERT, UPDATE et DELETE a
-- TOUT membre actif du restaurant, quel que soit son role. Les gardes de role
-- vivaient uniquement dans les Server Actions - et une Server Action ne garde
-- pas PostgREST, que la cle anon atteint directement.
--
-- Le depot avait deja commence a poser la bonne regle: `atfood_insert_menu_items`
-- et `atfood_insert_categories` verifient bien le role (owner/admin/manager +
-- is_active). Mais une policy permissive de plus est un OU logique: la policy
-- `ALL` les contournait entierement.
--
-- LA REGLE APPLIQUEE ICI N'EST PAS INVENTEE. C'est celle que les Server Actions
-- imposent deja, relevee dans le code: `['owner', 'admin', 'manager']` avec la
-- permission `menu.edit` (menu-items.ts, categories.ts, menus.ts) et
-- `orders.manage` pour tables.ts. La base dit donc desormais la meme chose que
-- l'application.
--
-- PIEGE EVITE - LA LECTURE. Les policies publiques de ces tables FILTRENT les
-- lignes (`is_active = true`, ou `deleted_at IS NULL` pour menu_items). C'est
-- la policy `ALL` qui permettait a l'admin de VOIR une categorie desactivee.
-- La retirer sans compensation aurait rendu impossible de reactiver une
-- categorie, un menu ou une table: on ne les verrait plus du tout. Chaque
-- `ALL` est donc remplacee par DEUX choses: une policy SELECT pour les membres
-- (appartenance seule, exactement l'ancienne condition - tout le personnel
-- continue de tout lire), et des policies d'ecriture qui verifient le role.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS. `orders`, `order_items`, `payments` et
-- `tenants` portent le meme defaut. Ils sont volontairement hors de ce lot:
-- ce sont les chemins chauds du service et de l'argent, ils demandent leur
-- propre analyse de ce qui ecrit avec le jeton de l'utilisateur. Les fermer
-- ici, dans la meme migration que le catalogue, c'est risquer de couper une
-- prise de commande en salle sans pouvoir le distinguer d'une regression du
-- catalogue.
--
-- ROLLBACK: voir le bloc en fin de fichier.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. menu_items
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage own tenant menu items" ON public.menu_items;

CREATE POLICY "Members can read own tenant menu items"
  ON public.menu_items
  FOR SELECT
  USING (tenant_id = ANY (get_my_tenant_ids_array()));

-- INSERT est deja couvert par `atfood_insert_menu_items` (role verifie).
CREATE POLICY "Menu managers can update own tenant menu items"
  ON public.menu_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = (SELECT auth.uid())
        AND au.tenant_id = menu_items.tenant_id
        AND au.role = ANY (ARRAY['owner', 'admin', 'manager'])
        AND (au.is_active IS NULL OR au.is_active = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = (SELECT auth.uid())
        AND au.tenant_id = menu_items.tenant_id
        AND au.role = ANY (ARRAY['owner', 'admin', 'manager'])
        AND (au.is_active IS NULL OR au.is_active = true)
    )
  );

CREATE POLICY "Menu managers can delete own tenant menu items"
  ON public.menu_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = (SELECT auth.uid())
        AND au.tenant_id = menu_items.tenant_id
        AND au.role = ANY (ARRAY['owner', 'admin', 'manager'])
        AND (au.is_active IS NULL OR au.is_active = true)
    )
  );

-- ---------------------------------------------------------------------------
-- 2. categories
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage own tenant categories" ON public.categories;

CREATE POLICY "Members can read own tenant categories"
  ON public.categories
  FOR SELECT
  USING (tenant_id = ANY (get_my_tenant_ids_array()));

-- INSERT est deja couvert par `atfood_insert_categories` (role verifie).
CREATE POLICY "Menu managers can update own tenant categories"
  ON public.categories
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = (SELECT auth.uid())
        AND au.tenant_id = categories.tenant_id
        AND au.role = ANY (ARRAY['owner', 'admin', 'manager'])
        AND (au.is_active IS NULL OR au.is_active = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = (SELECT auth.uid())
        AND au.tenant_id = categories.tenant_id
        AND au.role = ANY (ARRAY['owner', 'admin', 'manager'])
        AND (au.is_active IS NULL OR au.is_active = true)
    )
  );

CREATE POLICY "Menu managers can delete own tenant categories"
  ON public.categories
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = (SELECT auth.uid())
        AND au.tenant_id = categories.tenant_id
        AND au.role = ANY (ARRAY['owner', 'admin', 'manager'])
        AND (au.is_active IS NULL OR au.is_active = true)
    )
  );

-- ---------------------------------------------------------------------------
-- 3. menus
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage own tenant menus" ON public.menus;

CREATE POLICY "Members can read own tenant menus"
  ON public.menus
  FOR SELECT
  USING (tenant_id = ANY (get_my_tenant_ids_array()));

CREATE POLICY "Menu managers can insert own tenant menus"
  ON public.menus
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = (SELECT auth.uid())
        AND au.tenant_id = menus.tenant_id
        AND au.role = ANY (ARRAY['owner', 'admin', 'manager'])
        AND (au.is_active IS NULL OR au.is_active = true)
    )
  );

CREATE POLICY "Menu managers can update own tenant menus"
  ON public.menus
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = (SELECT auth.uid())
        AND au.tenant_id = menus.tenant_id
        AND au.role = ANY (ARRAY['owner', 'admin', 'manager'])
        AND (au.is_active IS NULL OR au.is_active = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = (SELECT auth.uid())
        AND au.tenant_id = menus.tenant_id
        AND au.role = ANY (ARRAY['owner', 'admin', 'manager'])
        AND (au.is_active IS NULL OR au.is_active = true)
    )
  );

CREATE POLICY "Menu managers can delete own tenant menus"
  ON public.menus
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = (SELECT auth.uid())
        AND au.tenant_id = menus.tenant_id
        AND au.role = ANY (ARRAY['owner', 'admin', 'manager'])
        AND (au.is_active IS NULL OR au.is_active = true)
    )
  );

-- ---------------------------------------------------------------------------
-- 4. tables (configuration de salle)
-- ---------------------------------------------------------------------------
-- La condition d'origine utilisait `get_my_tenant_ids()` (set-returning) et non
-- `get_my_tenant_ids_array()`. La lecture des membres la reprend TELLE QUELLE:
-- changer de helper au passage melangerait deux modifications.
DROP POLICY IF EXISTS "Admins can manage tables" ON public.tables;

CREATE POLICY "Members can read own tenant tables"
  ON public.tables
  FOR SELECT
  USING (tenant_id IN (SELECT get_my_tenant_ids()));

CREATE POLICY "Table managers can insert own tenant tables"
  ON public.tables
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = (SELECT auth.uid())
        AND au.tenant_id = tables.tenant_id
        AND au.role = ANY (ARRAY['owner', 'admin', 'manager'])
        AND (au.is_active IS NULL OR au.is_active = true)
    )
  );

CREATE POLICY "Table managers can update own tenant tables"
  ON public.tables
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = (SELECT auth.uid())
        AND au.tenant_id = tables.tenant_id
        AND au.role = ANY (ARRAY['owner', 'admin', 'manager'])
        AND (au.is_active IS NULL OR au.is_active = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = (SELECT auth.uid())
        AND au.tenant_id = tables.tenant_id
        AND au.role = ANY (ARRAY['owner', 'admin', 'manager'])
        AND (au.is_active IS NULL OR au.is_active = true)
    )
  );

CREATE POLICY "Table managers can delete own tenant tables"
  ON public.tables
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = (SELECT auth.uid())
        AND au.tenant_id = tables.tenant_id
        AND au.role = ANY (ARRAY['owner', 'admin', 'manager'])
        AND (au.is_active IS NULL OR au.is_active = true)
    )
  );

-- ============================================================================
-- ROLLBACK (si une ecriture legitime se revelait cassee)
-- ============================================================================
-- DROP POLICY IF EXISTS "Members can read own tenant menu items" ON public.menu_items;
-- DROP POLICY IF EXISTS "Menu managers can update own tenant menu items" ON public.menu_items;
-- DROP POLICY IF EXISTS "Menu managers can delete own tenant menu items" ON public.menu_items;
-- CREATE POLICY "Admins can manage own tenant menu items" ON public.menu_items
--   FOR ALL USING (tenant_id = ANY (get_my_tenant_ids_array()))
--   WITH CHECK (tenant_id = ANY (get_my_tenant_ids_array()));
-- (idem categories et menus; pour tables, condition
--  `tenant_id IN (SELECT get_my_tenant_ids())`.)
