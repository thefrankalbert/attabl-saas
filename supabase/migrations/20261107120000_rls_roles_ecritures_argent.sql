-- ============================================================================
-- Les ECRITURES D'ARGENT ne regardaient que l'APPARTENANCE, jamais le ROLE
-- ============================================================================
--
-- Suite de 20261107100000 (catalogue), qui avait laisse ces quatre tables de
-- cote. Elles portent le meme defaut, et c'est ici qu'il touche l'argent.
--
-- MESURE, PAS SUPPOSE (2026-11-07, base locale au schema du projet). Un employe
-- de role `waiter`, avec la seule cle anon du bundle et son propre compte,
-- attaquant PostgREST directement:
--
--   waiter marque une commande PAYEE sans ligne de paiement => POSSIBLE
--   waiter change le TOTAL d une commande                    => POSSIBLE
--   waiter met la TVA du restaurant a zero                   => POSSIBLE
--   waiter SUPPRIME une commande                             => POSSIBLE
--
-- Marquer payee sans ligne au ledger, c'est faire disparaitre une recette:
-- l'encaissement n'existe plus pour la comptabilite, mais la commande est
-- servie. Mettre la TVA a zero fausse toutes les commandes suivantes.
--
-- POURQUOI RESSERRER NE CASSE PAS LE SERVICE EN SALLE - verifie, pas espere:
--   - la caisse (`/api/orders/pos`) ecrit avec le client service_role, donc
--     HORS RLS: elle n'est pas concernee par ces policies;
--   - la commande d'un client passe par la RPC `create_order_with_items`
--     (SECURITY DEFINER), donc hors RLS aussi;
--   - les Server Actions qui ecrivent commandes et paiements exigent deja
--     owner/admin/manager; `tenant-settings.ts` garde la meme liste;
--   - l'ecriture de `last_active_at` dans le layout admin utilise le client
--     service_role;
--   - l'onboarding ecrit avec le jeton du PROPRIETAIRE.
--
-- LES LECTURES NE BOUGENT PAS. Contrairement au catalogue, chaque table porte
-- deja sa propre policy SELECT pour les membres ("Admins can view own tenant
-- orders", `order_items_tenant_select`, `payments_tenant_select`,
-- "Authenticated users can read tenants they belong to"): retirer la policy
-- `ALL` d'`orders` ne retire donc aucune lecture. Verifie avant d'ecrire ce
-- fichier.
--
-- `payments` N'A VOLONTAIREMENT AUCUNE policy UPDATE NI DELETE, ni avant ni
-- apres: le ledger est en append-only. Ce fichier ne fait que resserrer son
-- INSERT.
--
-- ROLLBACK: voir le bloc en fin de fichier.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. La fonction accepte desormais une permission NULLE
-- ---------------------------------------------------------------------------
-- `tenants` est garde par un ROLE seul dans l'application (tenant-settings.ts:
-- "only owner/admin/manager may change tenant settings"), sans code de
-- permission fine - et il n'existe pas de `settings.edit` dans PermissionCode.
-- Passer un faux code ici serait obscur; `p_perm IS NULL` dit exactement ce
-- que fait la garde: le role, et rien d'autre.
--
-- Meme signature que la version de 20261107100000, donc les 14 policies deja
-- posees continuent de fonctionner sans etre touchees.
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
        OR (
          au.role = ANY (ARRAY['admin', 'manager'])
          AND CASE
                WHEN p_perm IS NULL THEN true
                WHEN au.custom_permissions ? p_perm
                  THEN (au.custom_permissions ->> p_perm) <> 'false'
                WHEN rp.permissions ? p_perm
                  THEN (rp.permissions ->> p_perm) <> 'false'
                ELSE true
              END
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_tenant_write_permission(uuid, text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. orders
-- ---------------------------------------------------------------------------
-- La policy `ALL` accordait INSERT, UPDATE et DELETE a tout membre. Les deux
-- autres etaient redondantes avec elle, et portaient le meme defaut.
DROP POLICY IF EXISTS "Admins can manage own tenant orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can delete their restaurant orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can manage their restaurant orders" ON public.orders;

CREATE POLICY "Order managers can insert own tenant orders"
  ON public.orders
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(orders.tenant_id, 'orders.manage'));

CREATE POLICY "Order managers can update own tenant orders"
  ON public.orders
  FOR UPDATE
  USING (public.has_tenant_write_permission(orders.tenant_id, 'orders.manage'))
  WITH CHECK (public.has_tenant_write_permission(orders.tenant_id, 'orders.manage'));

CREATE POLICY "Order managers can delete own tenant orders"
  ON public.orders
  FOR DELETE
  USING (public.has_tenant_write_permission(orders.tenant_id, 'orders.manage'));

-- ---------------------------------------------------------------------------
-- 2. order_items
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can insert own tenant order items" ON public.order_items;
DROP POLICY IF EXISTS "Admins can update own tenant order items" ON public.order_items;
DROP POLICY IF EXISTS "Admins can delete own tenant order items" ON public.order_items;

-- LE LIEN A LA COMMANDE PARENTE EST CONSERVE, et ce n'est pas decoratif. Les
-- policies d'origine ne regardaient QUE la commande parente
-- (`EXISTS (... o.id = order_items.order_id AND o.tenant_id = ANY (...))`).
-- Une premiere version de ce fichier l'avait remplace par le seul
-- `order_items.tenant_id` - une colonne que le CLIENT fournit a l'insertion.
-- Mesure: le declencheur `trg_order_items_tenant_id` est BEFORE INSERT
-- SEULEMENT, et ne remplit la colonne que si elle est NULL; aucune contrainte
-- composite (order_id, tenant_id) n'existe. Un gerant pouvait donc declarer
-- SON tenant tout en pointant la commande d'un AUTRE restaurant, et y ajouter
-- des lignes. Ma version etait donc PLUS FAIBLE que celle qu'elle remplacait.
-- Les deux conditions sont desormais exigees: la permission sur le tenant de
-- la ligne, ET la coherence avec la commande parente.
CREATE POLICY "Order managers can insert own tenant order items"
  ON public.order_items
  FOR INSERT
  WITH CHECK (
    public.has_tenant_write_permission(order_items.tenant_id, 'orders.manage')
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.tenant_id = order_items.tenant_id
    )
  );

CREATE POLICY "Order managers can update own tenant order items"
  ON public.order_items
  FOR UPDATE
  USING (
    public.has_tenant_write_permission(order_items.tenant_id, 'orders.manage')
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.tenant_id = order_items.tenant_id
    )
  )
  WITH CHECK (
    public.has_tenant_write_permission(order_items.tenant_id, 'orders.manage')
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.tenant_id = order_items.tenant_id
    )
  );

CREATE POLICY "Order managers can delete own tenant order items"
  ON public.order_items
  FOR DELETE
  USING (
    public.has_tenant_write_permission(order_items.tenant_id, 'orders.manage')
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.tenant_id = order_items.tenant_id
    )
  );

-- ---------------------------------------------------------------------------
-- 3. payments (ledger append-only: INSERT seulement, par construction)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "payments_tenant_insert" ON public.payments;

CREATE POLICY "payments_tenant_insert"
  ON public.payments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_tenant_write_permission(payments.tenant_id, 'orders.manage'));

-- ---------------------------------------------------------------------------
-- 4. tenants (reglages du restaurant: taxes, devise, service)
-- ---------------------------------------------------------------------------
-- Role seul, comme l'application (voir la note sur `p_perm IS NULL` ci-dessus).
DROP POLICY IF EXISTS "Admins can update own tenant" ON public.tenants;

CREATE POLICY "Settings managers can update own tenant"
  ON public.tenants
  FOR UPDATE
  USING (public.has_tenant_write_permission(tenants.id, NULL))
  WITH CHECK (public.has_tenant_write_permission(tenants.id, NULL));

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP POLICY IF EXISTS "Order managers can insert own tenant orders" ON public.orders;
-- DROP POLICY IF EXISTS "Order managers can update own tenant orders" ON public.orders;
-- DROP POLICY IF EXISTS "Order managers can delete own tenant orders" ON public.orders;
-- CREATE POLICY "Admins can manage own tenant orders" ON public.orders
--   FOR ALL USING (tenant_id = ANY (get_my_tenant_ids_array()))
--   WITH CHECK (tenant_id = ANY (get_my_tenant_ids_array()));
-- Les conditions d'origine, relevees en base avant remplacement (et non
-- reconstruites de memoire):
--   order_items INSERT/UPDATE/DELETE: EXISTS (SELECT 1 FROM orders o
--     WHERE o.id = order_items.order_id
--       AND o.tenant_id = ANY (get_my_tenant_ids_array()))
--   payments_tenant_insert (TO authenticated):
--     WITH CHECK (tenant_id = ANY (get_my_tenant_ids_array()))
--   "Admins can update own tenant":
--     USING / WITH CHECK (id = ANY (get_my_tenant_ids_array()))
