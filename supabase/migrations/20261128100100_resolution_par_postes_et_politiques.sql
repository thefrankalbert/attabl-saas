-- Lot 1 des roles du personnel, MIG2 : resolution des droits par postes, et
-- TOUTES les politiques repointees, dans UNE SEULE transaction (conception :
-- docs/roles-personnel/conception-lot1.md, C, D.1, E.1).
--
-- POURQUOI UN SEUL FICHIER. Des que le nouveau resolveur est valide,
-- `'orders.manage'` n'est plus un code du catalogue : il est refuse a tout le
-- monde, proprietaire compris. Si les politiques de `orders`, `order_items` et
-- `order_notes` etaient repointees dans une autre transaction, aucune commande
-- ne pourrait avancer entre les deux, sans la moindre erreur (un UPDATE refuse
-- par la RLS touche 0 ligne). L'ordre inverse ne vaut pas mieux. Ne JAMAIS
-- decouper ce fichier.
--
-- CE QUI CHANGE.
--   - Catalogue ferme : un code inconnu ou mal orthographie est refuse pour
--     tous. C'est le remplacant de l'ancienne branche ELSE, qui accordait tout
--     code inconnu a l'administrateur et au gerant.
--   - Ordre de decision : code hors catalogue, double authentification,
--     proprietaire, reglage par personne, puis pour chaque poste le reglage du
--     restaurant ou la matrice, en gardant le niveau le plus haut (cumul).
--   - Seul le niveau `full` ouvre une ecriture. `limited` n'ouvre rien tant que
--     le mecanisme qui le borne n'existe pas (lot 3).
--   - Les politiques gardent EXACTEMENT leur nom : le retour arriere les
--     supprime par ce nom avant de recreer les anciennes.
--
-- DERNIERE INSTRUCTION : un balayage de la base. S'il reste un seul litteral
-- hors catalogue passe a une garde, la migration s'annule d'elle-meme.
--
-- RETOUR ARRIERE : supabase/retour-arriere/20261128100100_retour_resolution_par_roles.sql
-- Permis seulement AVANT la fusion du code qui ecrit au nouveau format.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Le resolveur
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_permission_level(p_tenant uuid, p_perm text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT CASE
    WHEN p_perm IS NULL OR NOT (p_perm = ANY (private.codes_droits())) THEN NULL
    WHEN NOT public.mfa_satisfait() THEN NULL
    ELSE (
      SELECT n.niveau
      FROM public.admin_users AS au
      CROSS JOIN LATERAL (
        SELECT CASE
          WHEN 'owner' = ANY (au.postes) THEN 'full'
          WHEN au.permission_overrides ? p_perm THEN
            CASE WHEN (au.permission_overrides -> p_perm) = 'true'::jsonb THEN 'full' END
          ELSE (
            SELECT CASE max(CASE x.niveau WHEN 'full' THEN 2 WHEN 'limited' THEN 1 ELSE 0 END)
                     WHEN 2 THEN 'full' WHEN 1 THEN 'limited' END
            FROM (
              SELECT CASE
                       WHEN pp.permissions ? p_perm THEN
                         CASE WHEN (pp.permissions -> p_perm) = 'true'::jsonb THEN 'full' END
                       ELSE m.niveau
                     END AS niveau
              FROM unnest(au.postes) AS p(poste)
              LEFT JOIN public.poste_permissions AS pp
                     ON pp.tenant_id = au.tenant_id AND pp.poste = p.poste
              LEFT JOIN private.matrice_postes() AS m
                     ON m.poste = p.poste AND m.droit = p_perm
            ) AS x
          )
        END AS niveau
      ) AS n
      WHERE au.user_id = (SELECT auth.uid())
        AND au.tenant_id = p_tenant
        AND au.is_active IS TRUE
        AND au.deleted_at IS NULL
        AND n.niveau IS NOT NULL
      ORDER BY (n.niveau = 'full') DESC
      LIMIT 1
    )
  END;
$function$;

-- Restaurants ou l'appelant detient un droit. Sert aux politiques de LECTURE :
-- `tenant_id = ANY ((SELECT public.tenants_avec_droit('x'))::uuid[])` est evalue une
-- fois par requete. Un niveau inconnu rend un tableau vide (refus).
CREATE OR REPLACE FUNCTION public.tenants_avec_droit(p_perm text, p_niveau_min text DEFAULT 'full')
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT coalesce(array_agg(au.tenant_id), '{}'::uuid[])
  FROM public.admin_users AS au
  WHERE au.user_id = (SELECT auth.uid())
    AND au.is_active IS TRUE
    AND au.deleted_at IS NULL
    AND CASE p_niveau_min
          WHEN 'full' THEN public.tenant_permission_level(au.tenant_id, p_perm) = 'full'
          WHEN 'limited' THEN public.tenant_permission_level(au.tenant_id, p_perm) IS NOT NULL
          ELSE false
        END;
$function$;

-- Aides de RLS : sans EXECUTE pour anon et authenticated, la RLS casse. Pour
-- anon, auth.uid() est NULL : aucune ligne, donc NULL ou tableau vide.
REVOKE ALL ON FUNCTION public.tenant_permission_level(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenants_avec_droit(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_permission_level(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tenants_avec_droit(text, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Les trois gardes existantes (CREATE OR REPLACE conserve leurs grants)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_tenant_write_permission(p_tenant uuid, p_perm text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT coalesce(public.tenant_permission_level(p_tenant, p_perm) = 'full', false);
$function$;

-- Autorite d'argent du lot 1 : les quatre droits sensibles ENSEMBLE. Par defaut
-- proprietaire et gerant, comme l'ancienne liste owner/admin/manager. Accorder
-- UN seul de ces droits a une personne n'ouvre pas le lot entier. Le lot 3
-- decoupe par acte (rembourser, offrir, annuler avec argent, supprimer).
CREATE OR REPLACE FUNCTION public.has_tenant_money_permission(p_tenant uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT public.has_tenant_write_permission(p_tenant, 'orders.pay')
     AND public.has_tenant_write_permission(p_tenant, 'orders.refund')
     AND public.has_tenant_write_permission(p_tenant, 'orders.cancel')
     AND public.has_tenant_write_permission(p_tenant, 'orders.discount');
$function$;

-- Plan de salle, zones, affectations : "Reglages du restaurant".
CREATE OR REPLACE FUNCTION public.has_tenant_floor_permission(p_tenant uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT public.has_tenant_write_permission(p_tenant, 'settings.edit');
$function$;

-- ---------------------------------------------------------------------------
-- 3. Fonctions repointees. Corps de schema.sql recopies par programme ; seules
--    les lignes de droit changent.
-- ---------------------------------------------------------------------------

-- record_refund : la copie privee de la resolution (liste de roles, puis
-- `orders.manage`, puis `orders.pay`) est remplacee par la garde commune.
CREATE OR REPLACE FUNCTION "public"."record_refund"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_amount" numeric, "p_method" "text", "p_created_by" "uuid" DEFAULT NULL::"uuid", "p_client_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $function$
DECLARE
  v_total      numeric;
  v_tip        numeric;
  v_net        numeric;
  v_payment_id uuid;
  v_actor      uuid;
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
    SELECT a.id INTO v_actor
    FROM public.admin_users AS a
    WHERE a.user_id = (SELECT auth.uid())
      AND a.tenant_id = p_tenant_id
      AND a.is_active IS TRUE
      AND a.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'access denied: no active membership for tenant %', p_tenant_id
        USING ERRCODE = '42501';
    END IF;

    -- (3) ARGENT. Rembourser fait sortir de l'argent de la caisse : il faut
    -- l'autorite d'argent du lot 1 (encaisser, rembourser, annuler, remiser,
    -- les quatre en entier), resolue par la MEME fonction que la RLS. Par
    -- defaut : proprietaire et gerant, comme l'ancienne liste de roles.
    IF NOT public.has_tenant_money_permission(p_tenant_id) THEN
      RAISE EXCEPTION 'access denied: refund requires the money permission'
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

-- Rapports : `reports.view` devient `reports.money`.
CREATE OR REPLACE FUNCTION "public"."assert_tenant_reports_view"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $function$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  IF auth.role() = 'service_role' OR public.is_super_admin() THEN
    RETURN;
  END IF;
  -- Meme resolution que l'application (has_tenant_write_permission). Au lot 1
  -- tous les rapports exigent `reports.money` ; le lot 2 separe carte et argent.
  IF NOT public.has_tenant_write_permission(p_tenant_id, 'reports.money') THEN
    RAISE EXCEPTION 'Reports require the reports.money permission'
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

-- Deplacer une commande : `orders.manage` devient `orders.take`.
CREATE OR REPLACE FUNCTION "public"."reassign_order_table"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_new_table_number" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $function$
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

  -- A15: meme droit que l'action serveur (`orders.take` : deplacer une
  -- commande est un geste de salle). Sans ce controle, un membre sans ce droit
  -- deplacait une commande par l'API directe.
  IF coalesce(auth.role(), '') <> 'service_role'
     AND NOT public.is_super_admin()
     AND NOT public.has_tenant_write_permission(p_tenant_id, 'orders.take') THEN
    RAISE EXCEPTION 'access denied: reassigning an order requires orders.take'
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
$function$;

-- Lecture du stock : aussi pour qui gere les fournisseurs (commander sans voir
-- les niveaux n'a pas de sens), et plus pour un membre desactive ou retire.
CREATE OR REPLACE FUNCTION public.get_my_inventory_tenant_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT au.tenant_id), '{}')
  FROM public.admin_users au
  WHERE au.user_id = (SELECT auth.uid())
    AND au.is_active IS TRUE
    AND au.deleted_at IS NULL
    AND (public.has_tenant_write_permission(au.tenant_id, 'inventory.view')
         OR public.has_tenant_write_permission(au.tenant_id, 'inventory.edit')
         OR public.has_tenant_write_permission(au.tenant_id, 'suppliers.manage'));
$function$;

-- Appartenance : un membre retire (deleted_at) n'est plus membre.
CREATE OR REPLACE FUNCTION public.get_my_tenant_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select tenant_id
  from admin_users
  where user_id = auth.uid()
    and coalesce(is_active, true) = true
    and deleted_at is null
    and public.mfa_satisfait()
$function$;

CREATE OR REPLACE FUNCTION public.get_my_tenant_ids_array()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(array_agg(tenant_id), '{}')
  from admin_users
  where user_id = auth.uid()
    and coalesce(is_active, true) = true
    and deleted_at is null
    and public.mfa_satisfait()
$function$;

-- Journal d'audit : `user_role` recoit les postes de l'auteur ("waiter+cashier").
CREATE OR REPLACE FUNCTION "public"."audit_log_auteur_session"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $function$
DECLARE
  v_email text;
  v_role text;
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    SELECT au.email, array_to_string(au.postes, '+') INTO v_email, v_role
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
$function$;

-- ---------------------------------------------------------------------------
-- 4. Politiques repointees. MEMES NOMS qu'avant, texte de schema.sql recopie
--    par programme, seul le droit exige change.
-- ---------------------------------------------------------------------------
-- Commandes : `orders.manage` devient `orders.take` OU `kitchen.track` (la salle et la cuisine font avancer une commande).

DROP POLICY IF EXISTS "Order managers can update own tenant orders" ON "public"."orders";
CREATE POLICY "Order managers can update own tenant orders" ON "public"."orders" FOR UPDATE USING (("public"."has_tenant_write_permission"("tenant_id", 'orders.take'::"text") OR "public"."has_tenant_write_permission"("tenant_id", 'kitchen.track'::"text"))) WITH CHECK (("public"."has_tenant_write_permission"("tenant_id", 'orders.take'::"text") OR "public"."has_tenant_write_permission"("tenant_id", 'kitchen.track'::"text")));

DROP POLICY IF EXISTS "Order managers can update own tenant order items" ON "public"."order_items";
CREATE POLICY "Order managers can update own tenant order items" ON "public"."order_items" FOR UPDATE USING ((("public"."has_tenant_write_permission"("tenant_id", 'orders.take'::"text") OR "public"."has_tenant_write_permission"("tenant_id", 'kitchen.track'::"text")) AND (EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = "order_items"."tenant_id")))))) WITH CHECK ((("public"."has_tenant_write_permission"("tenant_id", 'orders.take'::"text") OR "public"."has_tenant_write_permission"("tenant_id", 'kitchen.track'::"text")) AND (EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = "order_items"."tenant_id"))))));

DROP POLICY IF EXISTS "Order managers can insert own tenant order_notes" ON "public"."order_notes";
CREATE POLICY "Order managers can insert own tenant order_notes" ON "public"."order_notes" FOR INSERT WITH CHECK (("public"."has_tenant_write_permission"("tenant_id", 'orders.take'::"text") OR "public"."has_tenant_write_permission"("tenant_id", 'kitchen.track'::"text")));

-- Coupons : `orders.discount`. Sans cela le chef, qui gagne `menu.edit`, gagnerait aussi les codes promo.

DROP POLICY IF EXISTS "Menu managers can delete own tenant coupons" ON "public"."coupons";
CREATE POLICY "Menu managers can delete own tenant coupons" ON "public"."coupons" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'orders.discount'::"text"));

DROP POLICY IF EXISTS "Menu managers can insert own tenant coupons" ON "public"."coupons";
CREATE POLICY "Menu managers can insert own tenant coupons" ON "public"."coupons" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'orders.discount'::"text"));

DROP POLICY IF EXISTS "Menu managers can update own tenant coupons" ON "public"."coupons";
CREATE POLICY "Menu managers can update own tenant coupons" ON "public"."coupons" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'orders.discount'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'orders.discount'::"text"));

-- Publicites et annonces : `settings.edit` (decision G.d du proprietaire).

DROP POLICY IF EXISTS "Menu managers can delete own tenant ads" ON "public"."ads";
CREATE POLICY "Menu managers can delete own tenant ads" ON "public"."ads" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));

DROP POLICY IF EXISTS "Menu managers can insert own tenant ads" ON "public"."ads";
CREATE POLICY "Menu managers can insert own tenant ads" ON "public"."ads" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));

DROP POLICY IF EXISTS "Menu managers can update own tenant ads" ON "public"."ads";
CREATE POLICY "Menu managers can update own tenant ads" ON "public"."ads" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));

DROP POLICY IF EXISTS "Menu managers can delete own tenant announcements" ON "public"."announcements";
CREATE POLICY "Menu managers can delete own tenant announcements" ON "public"."announcements" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));

DROP POLICY IF EXISTS "Menu managers can insert own tenant announcements" ON "public"."announcements";
CREATE POLICY "Menu managers can insert own tenant announcements" ON "public"."announcements" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));

DROP POLICY IF EXISTS "Menu managers can update own tenant announcements" ON "public"."announcements";
CREATE POLICY "Menu managers can update own tenant announcements" ON "public"."announcements" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'settings.edit'::"text"));

-- Fournisseurs : `suppliers.manage`.

DROP POLICY IF EXISTS "Inventory managers can insert own tenant suppliers" ON "public"."suppliers";
CREATE POLICY "Inventory managers can insert own tenant suppliers" ON "public"."suppliers" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'suppliers.manage'::"text"));

DROP POLICY IF EXISTS "Inventory managers can update own tenant suppliers" ON "public"."suppliers";
CREATE POLICY "Inventory managers can update own tenant suppliers" ON "public"."suppliers" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'suppliers.manage'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'suppliers.manage'::"text"));

DROP POLICY IF EXISTS "Inventory managers can delete own tenant suppliers" ON "public"."suppliers";
CREATE POLICY "Inventory managers can delete own tenant suppliers" ON "public"."suppliers" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'suppliers.manage'::"text"));

-- Variantes de prix : `menu.price`.

DROP POLICY IF EXISTS "Menu managers can delete own tenant price variants" ON "public"."item_price_variants";
CREATE POLICY "Menu managers can delete own tenant price variants" ON "public"."item_price_variants" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.price'::"text"));

DROP POLICY IF EXISTS "Menu managers can insert own tenant price variants" ON "public"."item_price_variants";
CREATE POLICY "Menu managers can insert own tenant price variants" ON "public"."item_price_variants" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.price'::"text"));

DROP POLICY IF EXISTS "Menu managers can update own tenant price variants" ON "public"."item_price_variants";
CREATE POLICY "Menu managers can update own tenant price variants" ON "public"."item_price_variants" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.price'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.price'::"text"));

-- Creer un plat, c'est fixer son prix : `menu.edit` ET `menu.price`.

DROP POLICY IF EXISTS "atfood_insert_menu_items" ON "public"."menu_items";
CREATE POLICY "atfood_insert_menu_items" ON "public"."menu_items" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text") AND "public"."has_tenant_write_permission"("tenant_id", 'menu.price'::"text")));

-- Lectures : une evaluation par REQUETE. Le SELECT entre parentheses, converti en uuid[], en fait un initplan ; sans lui la fonction serait rappelee a chaque ligne.

DROP POLICY IF EXISTS "Admins can read audit logs" ON "public"."audit_log";
CREATE POLICY "Admins can read audit logs" ON "public"."audit_log" FOR SELECT USING ("tenant_id" = ANY ((SELECT "public"."tenants_avec_droit"('audit.view'::"text"))::"uuid"[]));

DROP POLICY IF EXISTS "Proprietaires et admins lisent les paiements Flutterwave" ON "public"."flutterwave_payments";
CREATE POLICY "Proprietaires et admins lisent les paiements Flutterwave" ON "public"."flutterwave_payments" FOR SELECT TO "authenticated" USING ("tenant_id" = ANY ((SELECT "public"."tenants_avec_droit"('billing.manage'::"text", 'limited'::"text"))::"uuid"[]));

DROP POLICY IF EXISTS "tenant_admins_can_view_invitations" ON "public"."invitations";
CREATE POLICY "tenant_admins_can_view_invitations" ON "public"."invitations" FOR SELECT USING ("tenant_id" = ANY ((SELECT "public"."tenants_avec_droit"('team.manage'::"text"))::"uuid"[]));

-- Deux politiques mortes d'invitations : inactives faute de grant, et sans
-- filtre is_active ni deleted_at. Toute ecriture reste en service_role apres
-- controle applicatif.
DROP POLICY IF EXISTS "tenant_admins_can_insert_invitations" ON "public"."invitations";
DROP POLICY IF EXISTS "tenant_admins_can_update_invitations" ON "public"."invitations";

-- ---------------------------------------------------------------------------
-- 5. Balayage : aucun litteral hors catalogue ne doit rester
-- ---------------------------------------------------------------------------
-- Lit l'etat EFFECTIF de la base (politiques et corps de fonctions), pas le
-- texte des migrations. Une seule requete, partagee par cette migration, par le
-- test catalogue_droits_codes_connus et par le controle en production.
CREATE OR REPLACE FUNCTION private.droits_hors_catalogue()
RETURNS TABLE (origine text, code text)
LANGUAGE sql STABLE SET search_path = '' AS $function$
  WITH textes AS (
    SELECT 'politique ' || pol.tablename || ' / ' || pol.policyname AS origine,
           coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '') AS texte
    FROM pg_catalog.pg_policies AS pol
    UNION ALL
    SELECT 'fonction ' || n.nspname || '.' || p.proname, p.prosrc
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
  )
  SELECT t.origine, coalesce(m.l[1], m.l[2])
  FROM textes AS t
  CROSS JOIN LATERAL regexp_matches(
    t.texte,
    $re$(?:has_tenant_write_permission|tenant_permission_level)"?\s*\(\s*[^,()]+,\s*'([^']*)'|tenants_avec_droit"?\s*\(\s*'([^']*)'$re$,
    'g') AS m(l)
  WHERE NOT (coalesce(m.l[1], m.l[2]) = ANY (private.codes_droits()));
$function$;
REVOKE ALL ON FUNCTION private.droits_hors_catalogue() FROM PUBLIC, anon, authenticated, service_role;

DO $balayage$
DECLARE
  v_reste text;
BEGIN
  SELECT string_agg(h.origine || ' : ' || h.code, ' ; ') INTO v_reste
  FROM private.droits_hors_catalogue() AS h;
  IF v_reste IS NOT NULL THEN
    RAISE EXCEPTION 'migration annulee, litteral(aux) hors catalogue : %', v_reste;
  END IF;
END
$balayage$;

COMMIT;
