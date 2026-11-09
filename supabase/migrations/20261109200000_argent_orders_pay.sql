-- ============================================================================
-- L'argent devient une permission a part: `orders.pay`
-- ============================================================================
--
-- DECISION DU PROPRIETAIRE (2026-11-09, ecrite):
--   - le serveur prend les commandes a la caisse et les fait avancer (servie),
--     mais n'encaisse pas, ne rembourse pas, n'offre pas, ne touche pas aux
--     ardoises;
--   - le chef garde la cuisine, sans aucune operation d'argent;
--   - le caissier encaisse.
--
-- CE QUI ETAIT MESURE (test local avec de vrais comptes, 2026-11-09): un chef a
-- enregistre un paiement par `/api/orders/mutations` (type 'pay'). La seule
-- permission demandee etait `orders.manage`, que le chef detient pour faire
-- avancer les commandes. Encaisser et faire avancer etaient UNE seule
-- permission: impossible de donner l'un sans l'autre.
--
-- L'APPLICATION (meme PR) separe les deux: nouveau code `orders.pay`
-- (src/types/permission.types.ts), par defaut owner/admin/manager/cashier, ni
-- chef ni serveur. Chaque chemin d'argent l'exige (paiement, tender, ardoise,
-- annulation, encaissement a la caisse). Et le serveur recoit `orders.manage`
-- par defaut, pour faire avancer les commandes.
--
-- POURQUOI CETTE MIGRATION EST INDISPENSABLE, ET PAS UN SIMPLE FILET:
--
--   1. SANS ELLE, LE SERVEUR NE PEUT PAS FAIRE AVANCER UNE COMMANDE. Les
--      actions de statut ecrivent avec le jeton de l'employe, donc sous RLS, et
--      la policy UPDATE de `orders` exige `has_tenant_write_permission(...,
--      'orders.manage')`, dont le defaut en base exclut `waiter`. L'application
--      dirait oui, la base dirait non.
--
--   2. Mais rendre `orders.manage` au serveur EN BASE, seul, lui ouvrirait
--      l'argent par l'API directe (cle anon du bundle + son propre jeton):
--      inserer un tender `completed` dans `payments`, ou passer
--      `payment_status` a `paid`, CREER une commande posee sur l'ardoise
--      d'un client, ajouter des articles a une commande payee ou en reecrire
--      le prix et la quantite. Le chef le peut deja aujourd'hui. Les sections
--      3, 4, 8, 9 et 10 ci-dessous ferment ces chemins pour les deux roles.
--
-- CE QUE FAIT LA MIGRATION:
--   1. defaut de la base = defaut du produit: `orders.manage` ajoute `waiter`;
--      nouveau code `orders.pay` = admin, manager, cashier (owner toujours).
--      Les surcharges du proprietaire (role_permissions) et individuelles
--      (custom_permissions) tranchent toujours en premier, dans les deux sens;
--   2. `payments` INSERT exige `orders.pay` (au lieu de `orders.manage`);
--   3. l'autorite argent (rembourser, offrir, ardoises, supprimer une commande)
--      exige en plus `orders.pay`: un gerant a qui le proprietaire retire
--      l'argent le perd partout;
--   4. un declencheur refuse, sans `orders.pay`, tout UPDATE de `orders` qui
--      touche l'argent: statut de paiement, moyen, date de paiement, pourboire,
--      ardoise, offert, ou une ANNULATION (annuler une note impayee apres avoir
--      pris l'argent est le detournement classique). Aussi la NOTE DE TABLE
--      (`session_id`, `table_id`, `table_number`): sortir une commande impayee
--      de la note d'une table, c'est la faire disparaitre de l'addition. Et les
--      champs d'argent qu'aucun autre declencheur ne garde (`tax_amount`,
--      `coupon_id`, `cashier_id`, les champs `comp_*`). Faire avancer une
--      commande (`status`, `served_at`, `server_id`) reste a `orders.manage`.
--      Le changement de table de l'application passe par reassign_order_table
--      (SECURITY DEFINER: `current_user` y vaut le proprietaire de la
--      fonction, la garde ne la juge donc pas);
--   5. `table_sessions` (ouvrir/fermer une table) passe a `orders.pay`: la
--      regle retenue par 20261107180000 etait "qui peut encaisser peut fermer
--      la table" (la fermeture a lieu dans markPaid). Elle reste vraie avec le
--      nouveau code, et le serveur n'y gagne rien en passant a `orders.manage`.
--      Les ouvertures de session ne passent pas par cette policy:
--      create_order_with_items est SECURITY INVOKER, mais son EXECUTE n'est
--      accorde qu'a service_role et tous ses appelants utilisent le client
--      admin (RLS contournee); reassign_order_table est SECURITY DEFINER.
--      Aucune des deux n'est touchee;
--   6. `record_refund` (SECURITY DEFINER, donc hors RLS de `payments`) exige
--      en plus `orders.pay`. Seul ajout au corps stocke de 20261105120000.
--
--   7. `order_items` DELETE suit `orders` DELETE (autorite argent). Avant, il
--      suffisait de `orders.manage`: avec le serveur qui le recoit, il aurait
--      pu vider les articles de n'importe quelle commande, payee comprise, par
--      l'API directe. Le seul chemin applicatif (actionDeleteOrders) exige deja
--      owner/admin et `orders.pay`, et supprime les articles AVANT la commande:
--      une regle plus large sur les articles laissait des commandes sans
--      articles quand la suppression de la commande etait refusee.
--
--   8. `orders` INSERT exige `orders.pay` (au lieu de `orders.manage`). La
--      policy ne bloquait que l'offert, et le declencheur de la section 4 ne
--      joue qu'a l'UPDATE: avec `orders.manage`, un serveur pouvait creer par
--      l'API directe une commande sur l'ardoise de n'importe quel client, avec
--      le total et le pourboire de son choix (get_house_account_balances
--      ajoute total + pourboire a la dette du client). Aucun chemin applicatif
--      n'insere dans `orders` avec le jeton d'un employe.
--
--   9. `order_items` INSERT exige `orders.pay` (au lieu de `orders.manage`).
--      Avec `orders.manage`, un serveur ou un chef ajoutait par l'API directe
--      des articles a n'importe quelle commande, PAYEE comprise: `orders.total`
--      ne bouge pas, la cuisine prepare, le stock est deduit. Un offert sous un
--      autre nom. Aucun chemin applicatif n'insere d'article avec le jeton d'un
--      employe (caisse, menu client et rejeu hors ligne passent par le client
--      admin).
--
--  10. un declencheur sur `order_items` refuse, sans `orders.pay`, tout UPDATE
--      d'une colonne autre que le suivi de cuisine (`item_status`, `course`,
--      `held`, `fired_at`, `preparation_zone`). Sinon `quantity` et
--      `price_at_order` se reecrivaient, et avec eux le chiffre d'affaires par
--      plat et par categorie (les RPC de rapport somment
--      quantity * price_at_order). Liste BLANCHE: une colonne ajoutee plus
--      tard est gardee par defaut. Les deux seuls UPDATE applicatifs sous
--      jeton d'employe (actionUpdateItemStatus, setCourseHeld) n'ecrivent que
--      des colonnes de la liste.
--
--  11. `claim_coupon_usage` et `unclaim_coupon_usage` (SECURITY DEFINER)
--      exigent `orders.pay` d'un membre. Avant, n'importe quel membre du
--      restaurant les appelait par l'API directe: un serveur pouvait rendre
--      des utilisations a un coupon epuise et le faire resservir comme
--      remise. Les appelants applicatifs sont le client admin (caisse, menu
--      client, validation de coupon) et l'annulation d'une commande, qui
--      exige deja `orders.pay`.
--
-- CHEMINS DE CONFIANCE NON TOUCHES: la caisse POS ecrit en service_role (la
-- route /api/orders/pos exige `orders.pay` cote application avant d'encaisser),
-- les webhooks et le cron aussi. Le declencheur ne juge que `authenticated` et
-- `anon`, comme `refuser_reecriture_montants_commande`.
--
-- VERIFICATION: supabase/tests/rls/argent_orders_pay.test.sql (pgTAP, CI).
--
-- ROLLBACK (dans cet ordre):
--   -- reposer claim_coupon_usage et unclaim_coupon_usage tels que
--   -- 20260623000000 les definit;
--   DROP TRIGGER IF EXISTS trg_articles_argent_exige_orders_pay ON public.order_items;
--   DROP FUNCTION IF EXISTS public.refuser_articles_argent_sans_orders_pay();
--   -- reposer "Order managers can insert own tenant order items" tel que
--   -- 20261107120000 le definit;
--   -- reposer "Order managers can insert own tenant orders" tel que
--   -- 20261107200000 (section 2) le definit;
--   -- reposer "Order managers can delete own tenant order items" tel que
--   -- 20261107120000 le definit;
--   -- reposer `record_refund` tel que 20261105120000 le definit;
--   -- reposer les trois policies de table_sessions avec 'orders.manage'
--   -- (20261107180000, section 3);
--   DROP TRIGGER IF EXISTS trg_argent_exige_orders_pay ON public.orders;
--   DROP FUNCTION IF EXISTS public.refuser_argent_sans_orders_pay();
--   -- reposer `payments_tenant_insert` et `has_tenant_money_permission` tels
--   -- que 20261107200000 et 20261107190000 les definissent;
--   -- reposer `has_tenant_write_permission` tel que 20261107210000 le definit.
--   -- L'application doit etre redeployee AVANT ce rollback, sinon le serveur
--   -- ne peut plus faire avancer une commande.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Defaut de la base = defaut du produit
-- ----------------------------------------------------------------------------
-- Corps identique a 20261107210000, sauf les deux branches `orders.manage` et
-- `orders.pay`.
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
                    ELSE au.role = ANY (ARRAY['admin', 'manager'])
                  END
           END
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_tenant_write_permission(uuid, text)
  TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Autorite argent: role de gerant ET orders.manage ET orders.pay
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_tenant_money_permission(p_tenant uuid)
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
  AND public.has_tenant_write_permission(p_tenant, 'orders.manage')
  AND public.has_tenant_write_permission(p_tenant, 'orders.pay');
$$;

GRANT EXECUTE ON FUNCTION public.has_tenant_money_permission(uuid)
  TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. payments: encaisser = orders.pay
-- ----------------------------------------------------------------------------
-- Meme forme que 20261107200000; seule la premiere condition change.
DROP POLICY IF EXISTS "payments_tenant_insert" ON public.payments;

CREATE POLICY "payments_tenant_insert"
  ON public.payments
  FOR INSERT
  WITH CHECK (
    public.has_tenant_write_permission(payments.tenant_id, 'orders.pay')
    AND (
      (payments.status = 'completed' AND payments.amount >= 0)
      OR public.has_tenant_money_permission(payments.tenant_id)
    )
  );

-- ----------------------------------------------------------------------------
-- 4. orders: toucher a l'argent d'une commande = orders.pay
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refuser_argent_sans_orders_pay()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER est ESSENTIEL: en DEFINER, `current_user` vaudrait toujours
-- le proprietaire de la fonction et la garde ne se declencherait jamais.
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF (
       NEW.payment_status IS DISTINCT FROM OLD.payment_status
       OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
       OR NEW.tip_amount IS DISTINCT FROM OLD.tip_amount
       OR NEW.house_account_id IS DISTINCT FROM OLD.house_account_id
       OR NEW.is_comp IS DISTINCT FROM OLD.is_comp
       OR (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
       -- La note de table: deplacer une commande impayee hors de la session
       -- d'une table la retire de l'addition.
       OR NEW.session_id IS DISTINCT FROM OLD.session_id
       OR NEW.table_id IS DISTINCT FROM OLD.table_id
       OR NEW.table_number IS DISTINCT FROM OLD.table_number
       -- Champs d'argent que refuser_reecriture_montants_commande ne garde pas.
       OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
       OR NEW.coupon_id IS DISTINCT FROM OLD.coupon_id
       OR NEW.cashier_id IS DISTINCT FROM OLD.cashier_id
       OR NEW.comp_reason IS DISTINCT FROM OLD.comp_reason
       OR NEW.comped_by IS DISTINCT FROM OLD.comped_by
       OR NEW.comped_at IS DISTINCT FROM OLD.comped_at
       OR NEW.comp_amount IS DISTINCT FROM OLD.comp_amount
     )
     -- Jugee sur le restaurant PROPRIETAIRE (OLD), comme les autres gardes.
     AND NOT public.has_tenant_write_permission(OLD.tenant_id, 'orders.pay')
  THEN
    RAISE EXCEPTION
      'Encaisser, annuler, changer la note d''une table ou mettre sur une ardoise exige le droit d''encaisser'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_argent_exige_orders_pay ON public.orders;
CREATE TRIGGER trg_argent_exige_orders_pay
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.refuser_argent_sans_orders_pay();

-- ----------------------------------------------------------------------------
-- 5. table_sessions: ouvrir et fermer une table = orders.pay
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Order managers can insert own tenant table_sessions" ON public.table_sessions;
DROP POLICY IF EXISTS "Order managers can update own tenant table_sessions" ON public.table_sessions;
DROP POLICY IF EXISTS "Order managers can delete own tenant table_sessions" ON public.table_sessions;
DROP POLICY IF EXISTS "Cashiers can insert own tenant table_sessions" ON public.table_sessions;
DROP POLICY IF EXISTS "Cashiers can update own tenant table_sessions" ON public.table_sessions;
DROP POLICY IF EXISTS "Cashiers can delete own tenant table_sessions" ON public.table_sessions;

CREATE POLICY "Cashiers can insert own tenant table_sessions"
  ON public.table_sessions
  FOR INSERT
  WITH CHECK (public.has_tenant_write_permission(table_sessions.tenant_id, 'orders.pay'));

CREATE POLICY "Cashiers can update own tenant table_sessions"
  ON public.table_sessions
  FOR UPDATE
  USING (public.has_tenant_write_permission(table_sessions.tenant_id, 'orders.pay'))
  WITH CHECK (public.has_tenant_write_permission(table_sessions.tenant_id, 'orders.pay'));

CREATE POLICY "Cashiers can delete own tenant table_sessions"
  ON public.table_sessions
  FOR DELETE
  USING (public.has_tenant_write_permission(table_sessions.tenant_id, 'orders.pay'));

-- ----------------------------------------------------------------------------
-- 6. record_refund: rembourser = orders.pay
-- ----------------------------------------------------------------------------
-- La RPC est SECURITY DEFINER: la RLS de `payments` (section 3) ne s'applique
-- pas a l'interieur. Elle verifiait le role de gerant et `orders.manage`, pas
-- `orders.pay`. Corps STOCKE recopie a l'identique (supabase/schema.sql =
-- 20261105120000), seul le bloc (3) ARGENT est ajoute. Signature et droits
-- d'execution inchanges (create or replace ne touche pas aux ACL).
create or replace function public.record_refund(
  p_order_id uuid,
  p_tenant_id uuid,
  p_amount numeric,
  p_method text,
  p_created_by uuid default null::uuid,
  p_client_request_id uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_total      numeric;
  v_tip        numeric;
  v_net        numeric;
  v_payment_id uuid;
  v_actor      uuid;
  v_role       text;
  v_custom     jsonb;
  v_tenant_ovr jsonb;
  v_allowed    boolean;
BEGIN
  -- (1) APPARTENANCE, avant toute autre chose. Leve 42501 si l'appelant n'est
  -- pas membre du restaurant. Laisse passer service_role et les super-admins.
  PERFORM public.assert_tenant_member(p_tenant_id);

  -- (2) HABILITATION. service_role (webhooks, cron) et super-admin agissent
  -- sans ligne de membre: pour eux `created_by` reste celui fourni, car ils
  -- agissent au nom de quelqu'un d'autre et n'ont pas d'id de membre propre.
  IF auth.role() = 'service_role' OR public.is_super_admin() THEN
    v_actor := p_created_by;
  ELSE
    -- La ligne de membre de l'APPELANT, jamais un parametre. `is_active` et
    -- `deleted_at` sont verifies ici: un compte suspendu ou retire ne doit pas
    -- pouvoir sortir de l'argent de la caisse.
    SELECT a.id, a.role, a.custom_permissions
      INTO v_actor, v_role, v_custom
    FROM admin_users a
    WHERE a.user_id = auth.uid()
      AND a.tenant_id = p_tenant_id
      AND a.is_active = true
      AND a.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'access denied: no active membership for tenant %', p_tenant_id
        USING ERRCODE = '42501';
    END IF;

    -- Le role doit figurer dans la MEME liste que celle de l'action serveur
    -- `actionRefundOrder`: ['owner','admin','manager']. Elle est plus stricte
    -- que la permission seule - par defaut `orders.manage` est aussi vrai pour
    -- `cashier` et `chef` (src/types/permission.types.ts) - et c'est la regle
    -- reellement appliquee en production aujourd'hui. On la reproduit telle
    -- quelle: une migration de securite n'est pas le lieu pour ELARGIR un
    -- acces.
    IF v_role NOT IN ('owner', 'admin', 'manager') THEN
      RAISE EXCEPTION 'access denied: role % cannot record refunds', v_role
        USING ERRCODE = '42501';
    END IF;

    -- Resolution de `orders.manage` dans l'ordre de src/lib/permissions.ts
    -- (hasPermission): owner toujours autorise, puis la derogation
    -- individuelle, puis la derogation du restaurant, puis le defaut du role.
    IF v_role = 'owner' THEN
      v_allowed := true;
    ELSIF v_custom ? 'orders.manage' THEN
      v_allowed := coalesce((v_custom -> 'orders.manage')::boolean, false);
    ELSE
      SELECT rp.permissions
        INTO v_tenant_ovr
      FROM role_permissions rp
      WHERE rp.tenant_id = p_tenant_id
        AND rp.role = v_role;

      IF v_tenant_ovr ? 'orders.manage' THEN
        v_allowed := coalesce((v_tenant_ovr -> 'orders.manage')::boolean, false);
      ELSE
        -- Defaut du role. Seul `waiter` a false, et il est de toute facon
        -- deja ecarte par la liste de roles ci-dessus.
        v_allowed := v_role IN ('owner', 'admin', 'manager', 'cashier', 'chef');
      END IF;
    END IF;

    IF NOT v_allowed THEN
      RAISE EXCEPTION 'access denied: orders.manage denied for role %', v_role
        USING ERRCODE = '42501';
    END IF;

    -- (3) ARGENT. Rembourser fait sortir de l'argent de la caisse: il faut en
    -- plus `orders.pay`, resolu par la meme fonction que la RLS (owner
    -- toujours, puis surcharge individuelle, puis surcharge de role, puis
    -- defaut). Ajoute par 20261109200000: un gerant a qui le proprietaire
    -- retire l'argent ne rembourse plus, meme en appelant la RPC en direct.
    IF NOT public.has_tenant_write_permission(p_tenant_id, 'orders.pay') THEN
      RAISE EXCEPTION 'access denied: orders.pay denied for role %', v_role
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ------------------------------------------------------------------------
  -- A partir d'ici, logique de caisse INCHANGEE (recopiee a l'identique).
  -- ------------------------------------------------------------------------
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant doit etre superieur a zero'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Rejeu: la meme cle renvoie la ligne deja ecrite, sans second mouvement de
  -- caisse. Fait AVANT le verrou, un rejeu ne doit pas attendre.
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_payment_id
    FROM payments
    WHERE tenant_id = p_tenant_id
      AND client_request_id = p_client_request_id;
    IF FOUND THEN
      RETURN v_payment_id;
    END IF;
  END IF;

  -- Le verrou porte sur la COMMANDE: il serialise tous les mouvements de caisse
  -- de cette commande, remboursements comme encaissements.
  SELECT total, COALESCE(tip_amount, 0)
    INTO v_total, v_tip
  FROM orders
  WHERE id = p_order_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable' USING ERRCODE = 'no_data_found';
  END IF;

  -- Net recalcule DANS la transaction, apres le verrou: c'est ce qui ferme le
  -- TOCTOU. Le second remboursement concurrent lit ici un net deja reduit.
  SELECT COALESCE(SUM(CASE WHEN status = 'refunded' THEN -amount ELSE amount END), 0)
    INTO v_net
  FROM payments
  WHERE order_id = p_order_id AND tenant_id = p_tenant_id;

  IF p_amount > v_net THEN
    RAISE EXCEPTION 'Le montant du remboursement depasse le montant encaisse'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO payments (tenant_id, order_id, amount, method, status, created_by, client_request_id)
  VALUES (p_tenant_id, p_order_id, p_amount, p_method, 'refunded', v_actor, p_client_request_id)
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$function$;

comment on function public.record_refund(uuid, uuid, numeric, text, uuid, uuid) is
  'Enregistre un remboursement. Verifie l''appartenance au restaurant, le role, orders.manage et orders.pay, et derive created_by de auth.uid(): les parametres p_tenant_id et p_created_by ne sont plus crus sur parole. Voir 20261105120000_record_refund_tenant_guard.sql et 20261109200000_argent_orders_pay.sql.';

-- ----------------------------------------------------------------------------
-- 7. order_items DELETE: meme autorite que orders DELETE
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Order managers can delete own tenant order items" ON public.order_items;
DROP POLICY IF EXISTS "Money managers can delete own tenant order items" ON public.order_items;

CREATE POLICY "Money managers can delete own tenant order items"
  ON public.order_items
  FOR DELETE
  USING (
    public.has_tenant_money_permission(order_items.tenant_id)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.tenant_id = order_items.tenant_id
    )
  );

-- ----------------------------------------------------------------------------
-- 8. orders INSERT: creer une commande sous son propre jeton = orders.pay
-- ----------------------------------------------------------------------------
-- Meme forme que 20261107200000 (section 2); seule la permission change. Aucun
-- chemin applicatif n'insere dans `orders` avec le jeton d'un employe: la
-- caisse (/api/orders/pos), le menu client et le rejeu hors ligne passent par
-- le client admin (create_order_with_items, EXECUTE reserve a service_role).
-- Cette policy ne sert donc qu'a l'API directe, ou elle laissait creer une
-- commande sur l'ardoise de n'importe quel client, avec le total et le
-- pourboire de son choix.
DROP POLICY IF EXISTS "Order managers can insert own tenant orders" ON public.orders;
DROP POLICY IF EXISTS "Cashiers can insert own tenant orders" ON public.orders;

CREATE POLICY "Cashiers can insert own tenant orders"
  ON public.orders
  FOR INSERT
  WITH CHECK (
    public.has_tenant_write_permission(orders.tenant_id, 'orders.pay')
    AND (
      (
        coalesce(orders.payment_status, '') NOT IN ('comp', 'refunded')
        AND coalesce(orders.is_comp, false) = false
      )
      OR public.has_tenant_money_permission(orders.tenant_id)
    )
  );

-- ----------------------------------------------------------------------------
-- 9. order_items INSERT: ajouter un article = orders.pay
-- ----------------------------------------------------------------------------
-- Meme forme que 20261107120000 (lien a la commande parente conserve); seule
-- la permission change.
DROP POLICY IF EXISTS "Order managers can insert own tenant order items" ON public.order_items;
DROP POLICY IF EXISTS "Cashiers can insert own tenant order items" ON public.order_items;

CREATE POLICY "Cashiers can insert own tenant order items"
  ON public.order_items
  FOR INSERT
  WITH CHECK (
    public.has_tenant_write_permission(order_items.tenant_id, 'orders.pay')
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.tenant_id = order_items.tenant_id
    )
  );

-- ----------------------------------------------------------------------------
-- 10. order_items UPDATE: hors suivi de cuisine = orders.pay
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refuser_articles_argent_sans_orders_pay()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER, pour la meme raison que la section 4.
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Ce que `orders.manage` suffit a changer: le suivi de cuisine.
  suivi constant text[] := ARRAY['item_status', 'course', 'held', 'fired_at', 'preparation_zone'];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - suivi) IS DISTINCT FROM (to_jsonb(OLD) - suivi)
     AND NOT public.has_tenant_write_permission(OLD.tenant_id, 'orders.pay')
  THEN
    RAISE EXCEPTION
      'Changer la quantite, le prix ou le plat d''un article exige le droit d''encaisser'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_articles_argent_exige_orders_pay ON public.order_items;
CREATE TRIGGER trg_articles_argent_exige_orders_pay
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.refuser_articles_argent_sans_orders_pay();

-- ----------------------------------------------------------------------------
-- 11. Coupons: consommer ou rendre une utilisation = orders.pay
-- ----------------------------------------------------------------------------
-- Corps STOCKES recopies a l'identique (supabase/schema.sql), seule la branche
-- membre exige en plus `orders.pay`. Signatures et droits d'execution
-- inchanges (create or replace ne touche pas aux ACL).
CREATE OR REPLACE FUNCTION public.claim_coupon_usage(p_coupon_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rows INT;
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM coupons c
      WHERE c.id = p_coupon_id
        AND c.tenant_id = ANY (public.get_my_tenant_ids_array())
        AND public.has_tenant_write_permission(c.tenant_id, 'orders.pay')
    )
  ) THEN
    RAISE EXCEPTION 'access denied: coupon does not belong to caller tenant'
      USING ERRCODE = '42501';
  END IF;

  UPDATE coupons
  SET current_uses = current_uses + 1, updated_at = NOW()
  WHERE id = p_coupon_id
    AND is_active = true
    AND (max_uses IS NULL OR current_uses < max_uses)
    AND (valid_until IS NULL OR valid_until > NOW());

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.unclaim_coupon_usage(p_coupon_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM coupons c
      WHERE c.id = p_coupon_id
        AND c.tenant_id = ANY (public.get_my_tenant_ids_array())
        AND public.has_tenant_write_permission(c.tenant_id, 'orders.pay')
    )
  ) THEN
    RAISE EXCEPTION 'access denied: coupon does not belong to caller tenant'
      USING ERRCODE = '42501';
  END IF;
  UPDATE coupons
  SET current_uses = GREATEST(current_uses - 1, 0), updated_at = NOW()
  WHERE id = p_coupon_id;
END;
$$;
