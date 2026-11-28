-- RETOUR ARRIERE de MIG2 (20261128100100_resolution_par_postes_et_politiques.sql).
--
-- Rend a la base la resolution des droits PAR ROLE : les 10 fonctions et les
-- 24 politiques d'avant, recopiees mot pour mot de supabase/schema.sql
-- (instantane 20261124210700) par extraction programmee, jamais a la main. Un
-- test du depot (src/lib/__tests__/retour-arriere-roles-copies.test.ts) refait
-- cette comparaison a chaque lancement : le relancer le JOUR de l'application.
--
-- QUAND. Permis seulement AVANT la fusion du code qui ecrit au nouveau format.
-- Une fois ce code servi, les reglages vivent dans `permission_overrides` et
-- `poste_permissions` et rien ne les reporte vers les anciennes colonnes :
-- rejouer les anciens corps rendrait a chacun les droits de son ancien role, et
-- un retrait pose par le proprietaire disparaitrait. Apres la fusion on corrige
-- en avant. Le script refuse de lui-meme de tourner si le nouveau code a ecrit
-- (garde de l'etape 1, quatre compteurs).
--
-- ORDRE. Le retour arriere de MIG3 d'abord
-- (20261128100200_retour_gardes_prix_et_proprietaire.sql), puis celui-ci, puis
-- au besoin celui de MIG1 (20261128100000_retour_postes_colonnes.sql).
--
-- LANCEMENT : psql "$URL" -X -v ON_ERROR_STOP=1 -f ce_fichier
-- (le fichier porte son BEGIN et son COMMIT : tout ou rien).

BEGIN;

-- 1. Garde : rien de ce que le nouveau code sait ecrire ne doit differer de la
--    traduction de l'ancien. Sinon le nouveau code a ecrit, et ce retour ferait
--    perdre des reglages, un cumul de postes ou une invitation.
DO $garde$
DECLARE
  v_personnes int; v_cumuls int; v_postes int; v_invitations int;
BEGIN
  -- 1a. reglages par personne
  SELECT count(*) INTO v_personnes FROM public.admin_users AS a
  WHERE coalesce(a.permission_overrides, '{}'::jsonb)
          - CASE WHEN a.role = 'admin' THEN 'billing.manage' ELSE '' END
        IS DISTINCT FROM coalesce(private.droits_depuis_anciens(a.custom_permissions), '{}'::jsonb);
  -- 1b. postes : un cumul, ou un poste que l'ancien role ne donne pas (N4)
  SELECT count(*) INTO v_cumuls FROM public.admin_users AS a
  WHERE a.postes IS DISTINCT FROM private.postes_normalises(private.postes_depuis_role(a.role));
  -- 1c. reglages par poste
  SELECT count(*) INTO v_postes FROM public.poste_permissions AS pp
  WHERE NOT EXISTS (
    SELECT 1 FROM public.role_permissions AS rp
    WHERE rp.tenant_id = pp.tenant_id AND rp.role = pp.poste
      AND coalesce(private.droits_depuis_anciens(rp.permissions), '{}'::jsonb) = pp.permissions);
  -- 1d. invitations en attente : postes et reglages (N4)
  SELECT count(*) INTO v_invitations FROM public.invitations AS i
  WHERE i.status = 'pending'
    AND ( i.postes IS DISTINCT FROM private.postes_normalises(private.postes_depuis_role(i.role))
       OR coalesce(i.permission_overrides, '{}'::jsonb)
            - CASE WHEN i.role = 'admin' THEN 'billing.manage' ELSE '' END
          IS DISTINCT FROM coalesce(private.droits_depuis_anciens(i.custom_permissions), '{}'::jsonb) );
  IF v_personnes > 0 OR v_cumuls > 0 OR v_postes > 0 OR v_invitations > 0 THEN
    RAISE EXCEPTION 'retour arriere refuse : % reglage(s) par personne, % cumul(s) de postes, % reglage(s) par poste, % invitation(s) ecrits au nouveau format',
      v_personnes, v_cumuls, v_postes, v_invitations;
  END IF;
END
$garde$;

-- 2. Fonctions : copies mot pour mot de supabase/schema.sql (instantane
--    20261124210700), `CREATE FUNCTION` devenu `CREATE OR REPLACE FUNCTION`. Les
--    grants existants sont conserves par CREATE OR REPLACE.
-- schema.sql:3668-3712
CREATE OR REPLACE FUNCTION "public"."has_tenant_write_permission"("p_tenant" "uuid", "p_perm" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT public.mfa_satisfait() AND EXISTS (
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
                    -- B127: DEFAULT_PERMISSIONS donne aussi la lecture du stock
                    -- au chef (permission.types.ts), pas au caissier ni au serveur.
                    WHEN 'inventory.view'
                      THEN au.role = ANY (ARRAY['admin', 'manager', 'chef'])
                    ELSE au.role = ANY (ARRAY['admin', 'manager'])
                  END
           END
      )
  );
$$;

-- schema.sql:3644-3659
CREATE OR REPLACE FUNCTION "public"."has_tenant_money_permission"("p_tenant" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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

-- schema.sql:3621-3635
CREATE OR REPLACE FUNCTION "public"."has_tenant_floor_permission"("p_tenant" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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

-- schema.sql:4828-4970
CREATE OR REPLACE FUNCTION "public"."record_refund"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_amount" numeric, "p_method" "text", "p_created_by" "uuid" DEFAULT NULL::"uuid", "p_client_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;

-- schema.sql:647-663
CREATE OR REPLACE FUNCTION "public"."assert_tenant_reports_view"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  IF auth.role() = 'service_role' OR public.is_super_admin() THEN
    RETURN;
  END IF;
  -- Meme resolution que l'application: role, surcharge du role, surcharge
  -- individuelle (has_tenant_write_permission, DEFAULT_PERMISSIONS).
  IF NOT public.has_tenant_write_permission(p_tenant_id, 'reports.view') THEN
    RAISE EXCEPTION 'Reports require the reports.view permission'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

-- schema.sql:4602-4729
CREATE OR REPLACE FUNCTION "public"."reassign_order_table"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_new_table_number" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_old_table_number text;
  v_old_session_id uuid;
  v_service_type text;
  v_status text;
  v_new_session_id uuid;
  v_pending_count integer;
BEGIN
  -- Tenant-isolation guard: a member cannot reassign another tenant's order.
  PERFORM public.assert_tenant_member(p_tenant_id);

  -- A15: meme droit que l'action serveur (`orders.manage`). Sans ce controle,
  -- un membre sans ce droit deplacait une commande par l'API directe.
  IF coalesce(auth.role(), '') <> 'service_role'
     AND NOT public.is_super_admin()
     AND NOT public.has_tenant_write_permission(p_tenant_id, 'orders.manage') THEN
    RAISE EXCEPTION 'access denied: reassigning an order requires orders.manage'
      USING ERRCODE = '42501';
  END IF;

  -- Load the order, scoped to the tenant.
  SELECT table_number, session_id, service_type, status
    INTO v_old_table_number, v_old_session_id, v_service_type, v_status
    FROM orders
    WHERE id = p_order_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'no_data_found';
  END IF;

  -- Only dine-in orders live on a table / session.
  IF v_service_type IS DISTINCT FROM 'dine_in' THEN
    RAISE EXCEPTION 'Only dine-in orders can be reassigned' USING ERRCODE = 'check_violation';
  END IF;

  -- A cancelled order is terminal; moving it would resurrect it onto a table.
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot reassign a cancelled order' USING ERRCODE = 'check_violation';
  END IF;

  -- Destination table must be a real, non-empty label.
  IF p_new_table_number IS NULL OR btrim(p_new_table_number) = '' THEN
    RAISE EXCEPTION 'Destination table number is required' USING ERRCODE = 'check_violation';
  END IF;

  -- B133: la destination doit etre une table de CE restaurant (meme valeur
  -- que l'ecran envoie: `table_number`). Sans ce controle, une commande
  -- partait vers une etiquette inexistante et ouvrait une session fantome.
  IF NOT EXISTS (
    SELECT 1 FROM tables t
     WHERE t.tenant_id = p_tenant_id
       AND t.table_number = p_new_table_number
  ) THEN
    RAISE EXCEPTION 'Destination table not found' USING ERRCODE = 'no_data_found';
  END IF;

  -- No-op: already on the destination table.
  IF v_old_table_number IS NOT DISTINCT FROM p_new_table_number THEN
    RETURN;
  END IF;

  -- Lock both table sessions in a deterministic (sorted) order so two concurrent
  -- reassigns touching the same pair of tables cannot deadlock. If the order has no
  -- old table, only the destination needs locking.
  IF v_old_table_number IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || p_new_table_number));
  ELSIF v_old_table_number < p_new_table_number THEN
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || v_old_table_number));
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || p_new_table_number));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || p_new_table_number));
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || v_old_table_number));
  END IF;

  -- A reassign always targets a FREE table (the UI only offers free tables). Under
  -- the advisory lock, re-check the destination is still free: if it gained an open
  -- session between the picker load and now (a concurrent order / QR scan), reject
  -- instead of silently merging the moved order onto that other party's check.
  IF EXISTS (
    SELECT 1 FROM table_sessions
    WHERE tenant_id = p_tenant_id
      AND table_number = p_new_table_number
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Destination table is now occupied' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO table_sessions (tenant_id, table_number)
  VALUES (p_tenant_id, p_new_table_number)
  RETURNING id INTO v_new_session_id;

  -- Move the order onto the destination table + session.
  UPDATE orders
    SET table_number = p_new_table_number,
        session_id = v_new_session_id
    WHERE id = p_order_id AND tenant_id = p_tenant_id;

  -- Close the OLD session if nothing unsettled remains on it. A14: meme regle
  -- que close_table_session_if_settled (20261115200000, p_require_served = true,
  -- delai de 2 h): une commande impayee OU partiellement payee, ou pas encore
  -- servie, garde la table occupee. L'ancienne regle ne comptait que 'pending':
  -- un acompte laissait la table liberee avec une addition ouverte. The order we
  -- just moved no longer references the old session, so it is excluded.
  IF v_old_session_id IS NOT NULL AND v_old_session_id IS DISTINCT FROM v_new_session_id THEN
    SELECT count(*) INTO v_pending_count
      FROM orders
      WHERE tenant_id = p_tenant_id
        AND session_id = v_old_session_id
        AND status <> 'cancelled'
        AND (
          coalesce(payment_status, 'pending') IN ('pending', 'partial')
          OR (
            status NOT IN ('delivered', 'served')
            AND created_at > now() - interval '2 hours'
          )
        );

    IF v_pending_count = 0 THEN
      UPDATE table_sessions
        SET status = 'closed', closed_at = now()
        WHERE id = v_old_session_id AND status = 'open';
    END IF;
  END IF;
END;
$$;

-- schema.sql:2811-2820
CREATE OR REPLACE FUNCTION "public"."get_my_inventory_tenant_ids"() RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT COALESCE(array_agg(DISTINCT au.tenant_id), '{}')
  FROM public.admin_users au
  WHERE au.user_id = (SELECT auth.uid())
    AND (public.has_tenant_write_permission(au.tenant_id, 'inventory.view')
         OR public.has_tenant_write_permission(au.tenant_id, 'inventory.edit'));
$$;

-- schema.sql:2829-2838
CREATE OR REPLACE FUNCTION "public"."get_my_tenant_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select tenant_id
  from admin_users
  where user_id = auth.uid()
    and coalesce(is_active, true) = true
    and public.mfa_satisfait()
$$;

-- schema.sql:2847-2856
CREATE OR REPLACE FUNCTION "public"."get_my_tenant_ids_array"() RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(array_agg(tenant_id), '{}')
  from admin_users
  where user_id = auth.uid()
    and coalesce(is_active, true) = true
    and public.mfa_satisfait()
$$;

-- schema.sql:694-717
CREATE OR REPLACE FUNCTION "public"."audit_log_auteur_session"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_email text;
  v_role text;
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    SELECT au.email, au.role INTO v_email, v_role
      FROM public.admin_users au
     WHERE au.user_id = (SELECT auth.uid())
       AND au.tenant_id = NEW.tenant_id
       AND coalesce(au.is_active, true)
       AND au.deleted_at IS NULL
     ORDER BY au.created_at
     LIMIT 1;
    NEW.user_id := (SELECT auth.uid());
    NEW.user_email := coalesce(nullif((SELECT auth.jwt()) ->> 'email', ''), v_email);
    NEW.user_role := v_role;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Politiques : copies mot pour mot de supabase/schema.sql, chacune precedee
--    de son DROP. Les deux politiques d'invitations supprimees par MIG2 (INSERT
--    et UPDATE) sont recreees pour revenir exactement a l'etat d'avant.
-- schema.sql:12308
DROP POLICY IF EXISTS "Order managers can update own tenant orders" ON "public"."orders";
CREATE POLICY "Order managers can update own tenant orders" ON "public"."orders" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'orders.manage'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'orders.manage'::"text"));

-- schema.sql:12297
DROP POLICY IF EXISTS "Order managers can update own tenant order items" ON "public"."order_items";
CREATE POLICY "Order managers can update own tenant order items" ON "public"."order_items" FOR UPDATE USING (("public"."has_tenant_write_permission"("tenant_id", 'orders.manage'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = "order_items"."tenant_id")))))) WITH CHECK (("public"."has_tenant_write_permission"("tenant_id", 'orders.manage'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = "order_items"."tenant_id"))))));

-- schema.sql:12290
DROP POLICY IF EXISTS "Order managers can insert own tenant order_notes" ON "public"."order_notes";
CREATE POLICY "Order managers can insert own tenant order_notes" ON "public"."order_notes" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'orders.manage'::"text"));

-- schema.sql:12076
DROP POLICY IF EXISTS "Menu managers can delete own tenant coupons" ON "public"."coupons";
CREATE POLICY "Menu managers can delete own tenant coupons" ON "public"."coupons" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:12139
DROP POLICY IF EXISTS "Menu managers can insert own tenant coupons" ON "public"."coupons";
CREATE POLICY "Menu managers can insert own tenant coupons" ON "public"."coupons" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:12202
DROP POLICY IF EXISTS "Menu managers can update own tenant coupons" ON "public"."coupons";
CREATE POLICY "Menu managers can update own tenant coupons" ON "public"."coupons" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:12055
DROP POLICY IF EXISTS "Menu managers can delete own tenant ads" ON "public"."ads";
CREATE POLICY "Menu managers can delete own tenant ads" ON "public"."ads" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:12125
DROP POLICY IF EXISTS "Menu managers can insert own tenant ads" ON "public"."ads";
CREATE POLICY "Menu managers can insert own tenant ads" ON "public"."ads" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:12181
DROP POLICY IF EXISTS "Menu managers can update own tenant ads" ON "public"."ads";
CREATE POLICY "Menu managers can update own tenant ads" ON "public"."ads" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:12062
DROP POLICY IF EXISTS "Menu managers can delete own tenant announcements" ON "public"."announcements";
CREATE POLICY "Menu managers can delete own tenant announcements" ON "public"."announcements" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:12132
DROP POLICY IF EXISTS "Menu managers can insert own tenant announcements" ON "public"."announcements";
CREATE POLICY "Menu managers can insert own tenant announcements" ON "public"."announcements" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:12188
DROP POLICY IF EXISTS "Menu managers can update own tenant announcements" ON "public"."announcements";
CREATE POLICY "Menu managers can update own tenant announcements" ON "public"."announcements" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:11839
DROP POLICY IF EXISTS "Inventory managers can insert own tenant suppliers" ON "public"."suppliers";
CREATE POLICY "Inventory managers can insert own tenant suppliers" ON "public"."suppliers" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text"));

-- schema.sql:11881
DROP POLICY IF EXISTS "Inventory managers can update own tenant suppliers" ON "public"."suppliers";
CREATE POLICY "Inventory managers can update own tenant suppliers" ON "public"."suppliers" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text"));

-- schema.sql:11797
DROP POLICY IF EXISTS "Inventory managers can delete own tenant suppliers" ON "public"."suppliers";
CREATE POLICY "Inventory managers can delete own tenant suppliers" ON "public"."suppliers" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text"));

-- schema.sql:12118
DROP POLICY IF EXISTS "Menu managers can delete own tenant price variants" ON "public"."item_price_variants";
CREATE POLICY "Menu managers can delete own tenant price variants" ON "public"."item_price_variants" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:12174
DROP POLICY IF EXISTS "Menu managers can insert own tenant price variants" ON "public"."item_price_variants";
CREATE POLICY "Menu managers can insert own tenant price variants" ON "public"."item_price_variants" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:12244
DROP POLICY IF EXISTS "Menu managers can update own tenant price variants" ON "public"."item_price_variants";
CREATE POLICY "Menu managers can update own tenant price variants" ON "public"."item_price_variants" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:12671
DROP POLICY IF EXISTS "atfood_insert_menu_items" ON "public"."menu_items";
CREATE POLICY "atfood_insert_menu_items" ON "public"."menu_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:11512
DROP POLICY IF EXISTS "Admins can read audit logs" ON "public"."audit_log";
CREATE POLICY "Admins can read audit logs" ON "public"."audit_log" FOR SELECT USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE (("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("au"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"])) AND COALESCE("au"."is_active", true) AND ("au"."deleted_at" IS NULL)))));

-- schema.sql:12331
DROP POLICY IF EXISTS "Proprietaires et admins lisent les paiements Flutterwave" ON "public"."flutterwave_payments";
CREATE POLICY "Proprietaires et admins lisent les paiements Flutterwave" ON "public"."flutterwave_payments" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE (("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (COALESCE("au"."is_active", true) = true) AND ("au"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));

-- schema.sql:13267
DROP POLICY IF EXISTS "tenant_admins_can_view_invitations" ON "public"."invitations";
CREATE POLICY "tenant_admins_can_view_invitations" ON "public"."invitations" FOR SELECT USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE (("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("au"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND COALESCE("au"."is_active", true) AND ("au"."deleted_at" IS NULL)))));

-- schema.sql:13249
DROP POLICY IF EXISTS "tenant_admins_can_insert_invitations" ON "public"."invitations";
CREATE POLICY "tenant_admins_can_insert_invitations" ON "public"."invitations" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("admin_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));

-- schema.sql:13258
DROP POLICY IF EXISTS "tenant_admins_can_update_invitations" ON "public"."invitations";
CREATE POLICY "tenant_admins_can_update_invitations" ON "public"."invitations" FOR UPDATE USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("admin_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));

-- 4. Objets crees par MIG2, apres que plus aucune politique ne les appelle.
DROP FUNCTION IF EXISTS public.tenants_avec_droit(text, text);
DROP FUNCTION IF EXISTS public.tenant_permission_level(uuid, text);
DROP FUNCTION IF EXISTS private.droits_hors_catalogue();

COMMIT;
