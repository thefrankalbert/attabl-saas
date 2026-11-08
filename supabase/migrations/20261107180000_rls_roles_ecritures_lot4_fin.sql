-- ============================================================================
-- LOT 4 - fin du balayage des ecritures aveugles au role
-- ============================================================================
--
-- Termine 20261107100000 (catalogue), 20261107120000 (argent) et
-- 20261107160000 (lot 3). Apres ce fichier, PLUS AUCUNE table de donnees
-- metier du restaurant n'est ecrivable sans verification du role, et chaque
-- table ecartee l'est avec un motif mesure, pas reportee.
--
-- CORRECTION DE L'EN-TETE DU LOT 3. Il annoncait `restaurant_groups`,
-- `dish_photo_drafts` et `stock_alert_notifications` comme "a trancher". La
-- lecture des policies reelles en base dit autre chose:
--
--   dish_photo_drafts    DEJA role-aware. Sa policy verifie
--                        `role = ANY (ARRAY['owner','admin','manager'])`.
--                        Rien a faire: elle etait comptee a tort.
--   restaurant_groups    DEJA correcte, mais sur un autre axe: ses policies
--                        d'ecriture sont `owner_user_id = auth.uid()`, donc un
--                        utilisateur gere SON groupe. Ce n'est pas une
--                        ecriture de tenant ouverte a tout membre. Rien a
--                        faire.
--   stock_alert_notifs   bien un trou: INSERT/UPDATE/DELETE sur la seule
--                        appartenance. Traitee ici.
--
-- TABLES ECARTEES, AVEC MOTIF (ce ne sont pas des reports):
--
--   admin_users              ses policies d'ecriture ne sont pas de la meme
--                            classe: `Block super_admin escalation by
--                            non-super-admins` est une garde d'escalade de
--                            privileges, et `Members update their own admin
--                            row` est du self-service borne a
--                            `user_id = auth.uid()`. La gestion d'equipe passe
--                            par /api/invitations et actions/admin.ts, gardes
--                            en ['owner','admin']. Y poser une garde de
--                            permission metier n'ajoute rien et risque
--                            d'ouvrir l'escalade que la premiere ferme.
--   order_mutation_requests  journal d'IDEMPOTENCE, pas des donnees metier:
--                            les seules operations sont insert d'un
--                            `client_request_id`, update de `processed_at`, et
--                            delete en cas d'echec - tout cela dans UN meme
--                            appel, par le meme acteur (/api/orders/mutations).
--                            Une garde de role n'y protege aucune donnee et
--                            casserait la deduplication. La vraie protection
--                            de ce flux est la policy de `orders`, posee par
--                            20261107120000.
--   notifications,           lignes propres a UN utilisateur
--   user_preferences,        (`user_id = auth.uid()`): correctes telles
--   user_sessions,           quelles.
--   push_subscriptions,
--   onboarding_progress
--   audit_log                journal en ajout seul.
--   newsletter_subscriber    inscription publique, par construction.
--   orange_money_events,     `service_role` uniquement.
--   wave_events,
--   invitations, role_permissions
--
-- ROLLBACK: meme procede que le lot 3, voir son bloc de fin.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. item_options  (menu.edit)
-- ---------------------------------------------------------------------------
-- DEUX policies ALL permissives: les deux doivent partir (OU logique).
-- Aucun ecrivain dans `src` aujourd'hui (la table n'apparait que dans les
-- types generes), mais le trou est reel: la cle anon plus un compte de
-- serveur suffisent pour reecrire les options d'un plat via PostgREST.
DROP POLICY IF EXISTS "Admins manage item options" ON public.item_options;
DROP POLICY IF EXISTS "Admins manage own tenant item options" ON public.item_options;

-- Compensation de lecture: la seule autre policy SELECT est anon, bornee aux
-- plats disponibles. Sans celle-ci le personnel perdrait la vue sur les
-- options d'un plat indisponible.
CREATE POLICY "Members can read own tenant item options"
  ON public.item_options
  FOR SELECT
  USING (tenant_id = ANY (get_my_tenant_ids_array()));

CREATE POLICY "Menu managers can insert own tenant item options"
  ON public.item_options
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(item_options.tenant_id, 'menu.edit'));

CREATE POLICY "Menu managers can update own tenant item options"
  ON public.item_options
  FOR UPDATE
  USING (public.has_tenant_write_permission(item_options.tenant_id, 'menu.edit'))
  WITH CHECK (public.has_tenant_write_permission(item_options.tenant_id, 'menu.edit'));

CREATE POLICY "Menu managers can delete own tenant item options"
  ON public.item_options
  FOR DELETE
  USING (public.has_tenant_write_permission(item_options.tenant_id, 'menu.edit'));

-- ---------------------------------------------------------------------------
-- 2. stock_alert_notifications  (inventory.edit)
-- ---------------------------------------------------------------------------
-- Ecrite par notification.service, qui utilise DELIBEREMENT le client admin
-- (service_role) et contourne donc la RLS - son en-tete le dit. Resserrer ici
-- ne casse aucun chemin applicatif et ferme un trou reel: sans cela, un
-- serveur pouvait supprimer les alertes de stock de son restaurant.
DROP POLICY IF EXISTS "stock_alert_notifications_insert" ON public.stock_alert_notifications;
DROP POLICY IF EXISTS "stock_alert_notifications_update" ON public.stock_alert_notifications;
DROP POLICY IF EXISTS "stock_alert_notifications_delete" ON public.stock_alert_notifications;

-- Lecture deja couverte par "stock_alerts_select".
CREATE POLICY "Inventory managers can insert own tenant stock alerts"
  ON public.stock_alert_notifications
  FOR INSERT
  WITH CHECK (
    public.has_tenant_write_permission(stock_alert_notifications.tenant_id, 'inventory.edit')
  );

CREATE POLICY "Inventory managers can update own tenant stock alerts"
  ON public.stock_alert_notifications
  FOR UPDATE
  USING (
    public.has_tenant_write_permission(stock_alert_notifications.tenant_id, 'inventory.edit')
  )
  WITH CHECK (
    public.has_tenant_write_permission(stock_alert_notifications.tenant_id, 'inventory.edit')
  );

CREATE POLICY "Inventory managers can delete own tenant stock alerts"
  ON public.stock_alert_notifications
  FOR DELETE
  USING (
    public.has_tenant_write_permission(stock_alert_notifications.tenant_id, 'inventory.edit')
  );

-- ---------------------------------------------------------------------------
-- 3. table_sessions  (orders.manage)
-- ---------------------------------------------------------------------------
-- Chemin chaud du service: ouverture et fermeture d'une table en salle. La
-- regle retenue est celle de `orders` elle-meme (20261107120000,
-- `orders.manage`), et ce n'est pas un choix arbitraire: la fermeture de
-- session se produit DANS markPaid, qui exige deja `orders.manage` sur
-- `orders`. Qui peut encaisser peut donc fermer la table - la base dit
-- maintenant la meme chose que ce flux.
DROP POLICY IF EXISTS "table_sessions_tenant_write" ON public.table_sessions;

-- Lecture deja couverte par "table_sessions_tenant_select".
CREATE POLICY "Order managers can insert own tenant table_sessions"
  ON public.table_sessions
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(table_sessions.tenant_id, 'orders.manage'));

CREATE POLICY "Order managers can update own tenant table_sessions"
  ON public.table_sessions
  FOR UPDATE
  USING (public.has_tenant_write_permission(table_sessions.tenant_id, 'orders.manage'))
  WITH CHECK (public.has_tenant_write_permission(table_sessions.tenant_id, 'orders.manage'));

CREATE POLICY "Order managers can delete own tenant table_sessions"
  ON public.table_sessions
  FOR DELETE
  USING (public.has_tenant_write_permission(table_sessions.tenant_id, 'orders.manage'));
