-- ============================================================================
-- ATTABL - schema of record (generated snapshot)
-- ============================================================================
-- Full public-schema DDL of the production database (tables, RLS policies,
-- functions, indexes, constraints). Schema only - NO row data.
--
-- Purpose: the base schema of the core tables was historically unversioned
-- (migrations only ALTER existing tables). This snapshot documents the real
-- schema in the repo so it can be reviewed, diffed for drift, and used to
-- provision a fresh database.
--
-- This file is NOT part of the migration replay stream (it would conflict with
-- the existing applied migrations on prod). Regenerate after schema changes:
--   supabase db dump --linked --schema public -f supabase/schema.sql
--
-- 2026-11-05 : regenere avec pg_dump 17 et NON avec `supabase db dump`, qui
-- exige Docker (absent de cette machine). Commande reellement utilisee :
--   pg_dump "$DATABASE_URL" --schema-only --schema public --quote-all-identifiers
-- Le resultat inclut proprietaires et privileges, comme l'instantane precedent.
-- L'instantane d'avant datait d'une epoque a 34 tables : il en manquait 17 et
-- 42 policies. Il ne decrivait plus la base depuis des mois, ce qui faussait
-- tout audit s'appuyant dessus.
--
-- MARQUEUR LU PAR scripts/run-pgtap.sh. Derniere migration DEJA comprise dans
-- cet instantane. L'executant charge ce fichier puis applique uniquement les
-- migrations POSTERIEURES - beaucoup des anciennes ne sont pas idempotentes et
-- les rejouer casserait la base de test. A mettre a jour a chaque regeneration.
-- SCHEMA_SNAPSHOT_MIGRATION=20261105120000
--
-- A NE PAS CONFONDRE avec tests/journeys/fixtures/schema.sql, qui est FIGE au
-- marqueur FIXTURE_MARKER=20260628000000 et sert de base aux tests de parcours :
-- celui-la ne doit pas etre regenere sans adapter les tests.
-- ============================================================================
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";

--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: accept_invitation_membership("uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."accept_invitation_membership"("p_invitation_id" "uuid", "p_user_id" "uuid", "p_full_name" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inv invitations%ROWTYPE;
  v_slug text;
BEGIN
  SELECT * INTO v_inv
  FROM invitations
  WHERE id = p_invitation_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_inv.expires_at < now() THEN
    UPDATE invitations SET status = 'expired' WHERE id = v_inv.id;
    RAISE EXCEPTION 'INVITATION_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO admin_users (
    user_id, tenant_id, email, full_name, role, is_active, custom_permissions, created_by
  ) VALUES (
    p_user_id, v_inv.tenant_id, v_inv.email,
    COALESCE(NULLIF(trim(p_full_name), ''), v_inv.email),
    v_inv.role, true, v_inv.custom_permissions, v_inv.invited_by
  );

  UPDATE invitations SET status = 'accepted', accepted_at = now() WHERE id = v_inv.id;

  SELECT slug INTO v_slug FROM tenants WHERE id = v_inv.tenant_id;

  RETURN jsonb_build_object('tenantId', v_inv.tenant_id, 'tenantSlug', COALESCE(v_slug, ''));
END;
$$;


ALTER FUNCTION "public"."accept_invitation_membership"("p_invitation_id" "uuid", "p_user_id" "uuid", "p_full_name" "text") OWNER TO "postgres";

--
-- Name: adjust_ingredient_stock_tx("uuid", "uuid", numeric, "text", "text", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."adjust_ingredient_stock_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_delta" numeric, "p_movement_type" "text", "p_notes" "text" DEFAULT NULL::"text", "p_created_by" "uuid" DEFAULT NULL::"uuid", "p_supplier_id" "uuid" DEFAULT NULL::"uuid") RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_before NUMERIC(10,3); v_after NUMERIC(10,3);
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  IF p_movement_type NOT IN ('manual_add','manual_remove','adjustment','opening') THEN
    RAISE EXCEPTION 'INVALID_MOVEMENT_TYPE: %', p_movement_type USING ERRCODE = '22023';
  END IF;
  IF p_supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = p_supplier_id AND s.tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'INVALID_SUPPLIER' USING ERRCODE = '22023';
  END IF;
  SELECT current_stock INTO v_before FROM public.ingredients WHERE id = p_ingredient_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INGREDIENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  v_after := GREATEST(0, v_before + p_delta);
  UPDATE public.ingredients SET current_stock = v_after, updated_at = now() WHERE id = p_ingredient_id AND tenant_id = p_tenant_id;
  INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, notes, created_by, supplier_id)
  VALUES (p_tenant_id, p_ingredient_id, p_movement_type, v_after - v_before, p_notes, p_created_by, p_supplier_id);
  RETURN v_after;
END; $$;


ALTER FUNCTION "public"."adjust_ingredient_stock_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_delta" numeric, "p_movement_type" "text", "p_notes" "text", "p_created_by" "uuid", "p_supplier_id" "uuid") OWNER TO "postgres";

--
-- Name: assert_tenant_member("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."assert_tenant_member"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- service_role (order / signup / cron / admin flows) bypasses tenant checks
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;
  -- super admins may act across any tenant
  IF public.is_super_admin() THEN
    RETURN;
  END IF;
  -- the authenticated caller must belong to the tenant
  IF p_tenant_id = ANY (public.get_my_tenant_ids_array()) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'access denied: caller is not a member of tenant %', p_tenant_id
    USING ERRCODE = '42501';
END;
$$;


ALTER FUNCTION "public"."assert_tenant_member"("p_tenant_id" "uuid") OWNER TO "postgres";

--
-- Name: auto_create_user_preferences(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."auto_create_user_preferences"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_create_user_preferences"() OWNER TO "postgres";

--
-- Name: broadcast_order_status(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."broadcast_order_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Best-effort: never block an order status update on a broadcast failure.
  BEGIN
    PERFORM realtime.send(
      jsonb_build_object('id', NEW.id, 'status', NEW.status),
      'status',
      'order:' || NEW.id::text,
      false
    );
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."broadcast_order_status"() OWNER TO "postgres";

--
-- Name: cancel_stock_count("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."cancel_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_status text;
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  SELECT status INTO v_status FROM public.stock_counts
    WHERE id = p_count_id AND tenant_id = p_tenant_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COUNT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'COUNT_NOT_OPEN' USING ERRCODE = '22023'; END IF;
  UPDATE public.stock_counts SET status = 'cancelled', updated_at = now()
    WHERE id = p_count_id AND tenant_id = p_tenant_id;
END;
$$;


ALTER FUNCTION "public"."cancel_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid") OWNER TO "postgres";

--
-- Name: claim_activation_event("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."claim_activation_event"("p_tenant_id" "uuid", "p_event_key" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_rows INT;
BEGIN
  UPDATE tenants
  SET activation_events =
    coalesce(activation_events, '{}'::JSONB) || jsonb_build_object(p_event_key, to_jsonb(NOW()))
  WHERE id = p_tenant_id
    AND (activation_events->>p_event_key) IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;


ALTER FUNCTION "public"."claim_activation_event"("p_tenant_id" "uuid", "p_event_key" "text") OWNER TO "postgres";

--
-- Name: claim_coupon_usage("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."claim_coupon_usage"("p_coupon_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."claim_coupon_usage"("p_coupon_id" "uuid") OWNER TO "postgres";

--
-- Name: commit_stock_count("uuid", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."commit_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_committed_by" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_status text;
  v_line RECORD;
  v_before NUMERIC(10, 3);
  v_delta NUMERIC(10, 3);
  v_n INT := 0;
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  SELECT status INTO v_status FROM public.stock_counts
    WHERE id = p_count_id AND tenant_id = p_tenant_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COUNT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'COUNT_ALREADY_CLOSED' USING ERRCODE = '22023'; END IF;

  FOR v_line IN
    SELECT scl.ingredient_id, scl.counted_qty
    FROM public.stock_count_lines scl
    WHERE scl.count_id = p_count_id
      AND scl.tenant_id = p_tenant_id
      AND scl.counted_qty IS NOT NULL
  LOOP
    SELECT current_stock INTO v_before FROM public.ingredients
      WHERE id = v_line.ingredient_id AND tenant_id = p_tenant_id
      FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_delta := v_line.counted_qty - v_before;
    IF v_delta = 0 THEN CONTINUE; END IF;

    UPDATE public.ingredients SET current_stock = v_line.counted_qty, updated_at = now()
      WHERE id = v_line.ingredient_id AND tenant_id = p_tenant_id;

    INSERT INTO public.stock_movements
      (tenant_id, ingredient_id, movement_type, quantity, reference_id, notes, created_by)
    VALUES
      (p_tenant_id, v_line.ingredient_id, 'physical_count', v_delta, p_count_id,
       'Inventaire physique', p_committed_by);

    IF v_line.counted_qty <= 0 THEN
      UPDATE public.menu_items SET is_available = false
        WHERE tenant_id = p_tenant_id AND is_available = true AND id IN (
          SELECT r.menu_item_id FROM public.recipes r
          WHERE r.ingredient_id = v_line.ingredient_id AND r.tenant_id = p_tenant_id);
    ELSE
      UPDATE public.menu_items SET is_available = true
        WHERE tenant_id = p_tenant_id AND is_available = false AND id IN (
          SELECT r.menu_item_id FROM public.recipes r
          WHERE r.ingredient_id = v_line.ingredient_id AND r.tenant_id = p_tenant_id);
    END IF;

    v_n := v_n + 1;
  END LOOP;

  UPDATE public.stock_counts
    SET status = 'committed', committed_at = now(), committed_by = p_committed_by, updated_at = now()
    WHERE id = p_count_id AND tenant_id = p_tenant_id;

  RETURN v_n;
END;
$$;


ALTER FUNCTION "public"."commit_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_committed_by" "uuid") OWNER TO "postgres";

--
-- Name: create_order_with_items("uuid", "text", bigint, "text", "text", "text", "text", "text", "text", "text", bigint, bigint, bigint, bigint, bigint, "uuid", "uuid", "text", "text", "jsonb", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."create_order_with_items"("p_tenant_id" "uuid", "p_order_number" "text", "p_total" bigint, "p_table_number" "text" DEFAULT NULL::"text", "p_customer_name" "text" DEFAULT NULL::"text", "p_customer_phone" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text", "p_service_type" "text" DEFAULT 'dine_in'::"text", "p_room_number" "text" DEFAULT NULL::"text", "p_delivery_address" "text" DEFAULT NULL::"text", "p_subtotal" bigint DEFAULT NULL::bigint, "p_tax_amount" bigint DEFAULT 0, "p_service_charge_amount" bigint DEFAULT 0, "p_discount_amount" bigint DEFAULT 0, "p_tip_amount" bigint DEFAULT 0, "p_coupon_id" "uuid" DEFAULT NULL::"uuid", "p_server_id" "uuid" DEFAULT NULL::"uuid", "p_display_currency" "text" DEFAULT NULL::"text", "p_preparation_zone" "text" DEFAULT 'kitchen'::"text", "p_items" "jsonb" DEFAULT '[]'::"jsonb", "p_client_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_total bigint;
  v_item jsonb;
  v_session_id uuid;
  v_table_id uuid;
BEGIN
  IF p_client_request_id IS NOT NULL THEN
    SELECT id, order_number, total
      INTO v_order_id, v_order_number, v_total
      FROM orders
      WHERE tenant_id = p_tenant_id
        AND client_request_id = p_client_request_id;
    IF FOUND THEN
      RETURN jsonb_build_object('orderId', v_order_id, 'orderNumber', v_order_number, 'total', v_total, 'deduplicated', true);
    END IF;
  END IF;

  IF p_table_number IS NOT NULL THEN
    SELECT t.id INTO v_table_id
      FROM tables t
      JOIN zones z ON z.id = t.zone_id
      JOIN venues v ON v.id = z.venue_id
      WHERE v.tenant_id = p_tenant_id
        AND (t.table_number = p_table_number OR t.display_name = p_table_number)
      LIMIT 1;
  END IF;

  IF p_table_number IS NOT NULL AND COALESCE(p_service_type, 'dine_in') = 'dine_in' THEN
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || p_table_number));
    SELECT id INTO v_session_id
      FROM table_sessions
      WHERE tenant_id = p_tenant_id AND table_number = p_table_number AND status = 'open'
      LIMIT 1;
    IF v_session_id IS NULL THEN
      INSERT INTO table_sessions (tenant_id, table_number) VALUES (p_tenant_id, p_table_number)
      RETURNING id INTO v_session_id;
    END IF;
  END IF;

  INSERT INTO orders (
    tenant_id, order_number, status, total, table_number, table_id,
    customer_name, customer_phone, notes,
    service_type, room_number, delivery_address,
    subtotal, tax_amount, service_charge_amount,
    discount_amount, tip_amount, payment_status,
    coupon_id, server_id, display_currency, preparation_zone,
    client_request_id, session_id
  ) VALUES (
    p_tenant_id, p_order_number, 'pending', p_total, p_table_number, v_table_id,
    p_customer_name, p_customer_phone, p_notes,
    p_service_type, p_room_number, p_delivery_address,
    COALESCE(p_subtotal, p_total), p_tax_amount, p_service_charge_amount,
    p_discount_amount, p_tip_amount, 'pending',
    p_coupon_id, p_server_id, p_display_currency, p_preparation_zone,
    p_client_request_id, v_session_id
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (
      order_id, menu_item_id, item_name, item_name_en,
      quantity, price_at_order, customer_notes,
      modifiers, course, item_status, preparation_zone,
      selected_option, selected_variant
    ) VALUES (
      v_order_id,
      (v_item->>'menu_item_id')::uuid,
      v_item->>'item_name',
      v_item->>'item_name_en',
      COALESCE((v_item->>'quantity')::int, 1),
      COALESCE((v_item->>'price_at_order')::bigint, 0),
      v_item->>'customer_notes',
      COALESCE(v_item->'modifiers', '[]'::jsonb),
      v_item->>'course',
      'pending',
      COALESCE(v_item->>'preparation_zone', 'kitchen'),
      v_item->'selected_option',
      v_item->'selected_variant'
    );
  END LOOP;

  RETURN jsonb_build_object('orderId', v_order_id, 'orderNumber', p_order_number, 'total', p_total);

EXCEPTION
  WHEN unique_violation THEN
    IF p_client_request_id IS NULL THEN RAISE; END IF;
    SELECT id, order_number, total
      INTO v_order_id, v_order_number, v_total
      FROM orders
      WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
    IF NOT FOUND THEN RAISE; END IF;
    RETURN jsonb_build_object('orderId', v_order_id, 'orderNumber', v_order_number, 'total', v_total, 'deduplicated', true);
END;
$$;


ALTER FUNCTION "public"."create_order_with_items"("p_tenant_id" "uuid", "p_order_number" "text", "p_total" bigint, "p_table_number" "text", "p_customer_name" "text", "p_customer_phone" "text", "p_notes" "text", "p_service_type" "text", "p_room_number" "text", "p_delivery_address" "text", "p_subtotal" bigint, "p_tax_amount" bigint, "p_service_charge_amount" bigint, "p_discount_amount" bigint, "p_tip_amount" bigint, "p_coupon_id" "uuid", "p_server_id" "uuid", "p_display_currency" "text", "p_preparation_zone" "text", "p_items" "jsonb", "p_client_request_id" "uuid") OWNER TO "postgres";

--
-- Name: delete_admin_user_atomic("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."delete_admin_user_atomic"("p_admin_user_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id UUID;
  v_group_id UUID;
  tenant_members_total INT;
  user_memberships_remaining INT;
  group_tenants_remaining INT;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM admin_users
  WHERE id = p_admin_user_id;

  IF v_tenant_id IS NULL THEN
    RETURN FALSE;
  END IF;

  PERFORM 1 FROM tenants WHERE id = v_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE id = p_admin_user_id) THEN
    RETURN FALSE;
  END IF;

  SELECT group_id INTO v_group_id FROM tenants WHERE id = v_tenant_id;

  SELECT COUNT(*) INTO tenant_members_total
  FROM admin_users
  WHERE tenant_id = v_tenant_id;

  IF tenant_members_total <= 1 THEN
    DELETE FROM order_items
    WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = v_tenant_id);

    DELETE FROM tenants WHERE id = v_tenant_id;

    IF v_group_id IS NOT NULL THEN
      SELECT COUNT(*) INTO group_tenants_remaining
      FROM tenants
      WHERE group_id = v_group_id;

      IF group_tenants_remaining = 0 THEN
        DELETE FROM restaurant_groups WHERE id = v_group_id;
      END IF;
    END IF;
  ELSE
    UPDATE admin_users SET created_by = NULL
      WHERE created_by = p_admin_user_id AND tenant_id = v_tenant_id;
    UPDATE role_permissions SET updated_by = NULL
      WHERE updated_by = p_admin_user_id AND tenant_id = v_tenant_id;
    UPDATE invitations SET invited_by = (
      SELECT id FROM admin_users
      WHERE tenant_id = v_tenant_id AND id <> p_admin_user_id
      ORDER BY is_active DESC, (role = 'owner') DESC, created_at ASC
      LIMIT 1
    )
    WHERE invited_by = p_admin_user_id AND tenant_id = v_tenant_id;
    DELETE FROM admin_users WHERE id = p_admin_user_id;
  END IF;

  SELECT COUNT(*) INTO user_memberships_remaining
  FROM admin_users
  WHERE user_id = p_user_id;

  IF user_memberships_remaining = 0 THEN
    IF EXISTS (
      SELECT 1
      FROM restaurant_groups g
      JOIN tenants t ON t.group_id = g.id
      WHERE g.owner_user_id = p_user_id
    ) THEN
      RETURN FALSE;
    END IF;

    BEGIN
      DELETE FROM auth.users WHERE id = p_user_id;
      RETURN TRUE;
    EXCEPTION WHEN foreign_key_violation THEN
      RETURN FALSE;
    END;
  END IF;

  RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."delete_admin_user_atomic"("p_admin_user_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";

--
-- Name: destock_order("uuid", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."destock_order"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count INT := 0;
  v_item RECORD;
  v_recipe RECORD;
  v_new_stock NUMERIC(10,3);
  v_required NUMERIC(10,3);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('destock_order:' || p_order_id::text));

  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_id = p_order_id
      AND movement_type = 'order_destock'
  ) THEN
    RETURN 0;
  END IF;

  FOR v_item IN
    SELECT oi.menu_item_id, oi.quantity
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.order_id = p_order_id
      AND o.tenant_id = p_tenant_id
  LOOP
    FOR v_recipe IN
      SELECT r.ingredient_id, r.quantity_needed
      FROM public.recipes r
      WHERE r.menu_item_id = v_item.menu_item_id
        AND r.tenant_id = p_tenant_id
    LOOP
      v_required := v_recipe.quantity_needed * v_item.quantity;

      UPDATE public.ingredients
      SET current_stock = current_stock - v_required
      WHERE id = v_recipe.ingredient_id
        AND tenant_id = p_tenant_id
        AND current_stock >= v_required
      RETURNING current_stock INTO v_new_stock;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK';
      END IF;

      INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, reference_id, created_by)
      VALUES (
        p_tenant_id, v_recipe.ingredient_id, 'order_destock',
        -v_required, p_order_id, p_created_by
      );

      IF v_new_stock <= 0 THEN
        UPDATE public.menu_items
        SET is_available = false
        WHERE id IN (
          SELECT r2.menu_item_id FROM public.recipes r2
          WHERE r2.ingredient_id = v_recipe.ingredient_id AND r2.tenant_id = p_tenant_id
        )
        AND tenant_id = p_tenant_id AND is_available = true;
      END IF;

      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."destock_order"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid") OWNER TO "postgres";

--
-- Name: enforce_inventory_entitlement(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."enforce_inventory_entitlement"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_plan       text;
  v_status     text;
  v_trial_ends timestamptz;
  v_entitled   boolean;
BEGIN
  SELECT subscription_plan, subscription_status, trial_ends_at
    INTO v_plan, v_status, v_trial_ends
  FROM tenants
  WHERE id = NEW.tenant_id;

  -- COALESCE: si la ligne tenant est introuvable, les trois variables restent
  -- NULL et l'expression vaudrait NULL, donc `IF NOT NULL` serait faux et le
  -- trigger laisserait passer. Un paywall qui s'ouvre quand il ne sait pas n'est
  -- pas un paywall: on retombe explicitement sur 'starter', non entitle.
  v_entitled :=
    (v_status = 'trial' AND v_trial_ends IS NOT NULL AND v_trial_ends > now())
    OR (
      COALESCE(v_status, '') NOT IN ('cancelled', 'frozen')
      AND COALESCE(v_plan, 'starter') IN ('pro', 'business', 'enterprise')
    );

  IF NOT v_entitled THEN
    RAISE EXCEPTION 'Inventory module requires the Pro plan or higher'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_inventory_entitlement"() OWNER TO "postgres";

--
-- Name: enforce_min_one_active_venue(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."enforce_min_one_active_venue"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('venue_cap:' || NEW.tenant_id::text));

  IF NOT (OLD.is_active = true AND NEW.is_active = false) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
  FROM venues
  WHERE tenant_id = NEW.tenant_id AND is_active = true;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Cannot deactivate the last active venue'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_min_one_active_venue"() OWNER TO "postgres";

--
-- Name: enforce_qr_customization_entitlement(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."enforce_qr_customization_entitlement"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_plan       text;
  v_status     text;
  v_trial_ends timestamptz;
  v_entitled   boolean;
BEGIN
  SELECT subscription_plan, subscription_status, trial_ends_at
    INTO v_plan, v_status, v_trial_ends
  FROM tenants
  WHERE id = NEW.tenant_id;

  v_entitled :=
    (v_status = 'trial' AND v_trial_ends IS NOT NULL AND v_trial_ends > now())
    OR (v_plan IN ('pro', 'business', 'enterprise'));

  IF NOT v_entitled THEN
    RAISE EXCEPTION 'QR customization requires the Pro plan or higher'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_qr_customization_entitlement"() OWNER TO "postgres";

--
-- Name: enforce_tenant_name_cross_group_unique(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."enforce_tenant_name_cross_group_unique"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.group_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tenants t
    WHERE t.id <> NEW.id
      AND t.deleted_at IS NULL
      AND t.onboarding_completed = true
      AND t.group_id IS NOT NULL
      AND t.group_id <> NEW.group_id
      AND lower(btrim(t.name)) = lower(btrim(NEW.name))
  ) THEN
    RAISE EXCEPTION 'tenant_name_cross_group_conflict'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_tenant_name_cross_group_unique"() OWNER TO "postgres";

--
-- Name: enforce_venue_plan_limit(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."enforce_venue_plan_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_plan       text;
  v_status     text;
  v_trial_ends timestamptz;
  v_effective  text;
  v_max        int;
  v_count      int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('venue_cap:' || NEW.tenant_id::text));

  IF NOT (NEW.is_active = true AND (TG_OP = 'INSERT' OR OLD.is_active = false)) THEN
    RETURN NEW;
  END IF;

  SELECT subscription_plan, subscription_status, trial_ends_at
    INTO v_plan, v_status, v_trial_ends
  FROM tenants
  WHERE id = NEW.tenant_id;

  IF v_status = 'trial' AND v_trial_ends IS NOT NULL AND v_trial_ends > now() THEN
    v_effective := 'pro';
  ELSIF v_plan IN ('starter', 'pro', 'business', 'enterprise') THEN
    v_effective := v_plan;
  ELSE
    v_effective := 'starter';
  END IF;

  v_max := CASE v_effective
    WHEN 'starter'    THEN 1
    WHEN 'pro'        THEN 2
    WHEN 'business'   THEN 10
    WHEN 'enterprise' THEN NULL
    ELSE 1
  END;

  IF v_max IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM venues
    WHERE tenant_id = NEW.tenant_id AND is_active = true;

    IF v_count > v_max THEN
      RAISE EXCEPTION 'Venue limit reached for plan %', v_effective
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_venue_plan_limit"() OWNER TO "postgres";

--
-- Name: expire_stale_payment_sessions(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."expire_stale_payment_sessions"("p_max_age_minutes" integer DEFAULT 30) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE orders
  SET
    wave_checkout_id = NULL,
    orange_money_pay_token = NULL,
    orange_money_notif_token = NULL,
    payment_initiated_at = NULL,
    payment_method = NULL
  WHERE payment_status = 'pending'
    AND payment_initiated_at IS NOT NULL
    AND payment_initiated_at < now() - make_interval(mins => p_max_age_minutes)
    AND (
      wave_checkout_id IS NOT NULL
      OR orange_money_pay_token IS NOT NULL
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."expire_stale_payment_sessions"("p_max_age_minutes" integer) OWNER TO "postgres";

--
-- Name: generate_menu_slug("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."generate_menu_slug"("p_tenant_id" "uuid", "p_name" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  -- Transliterate accented chars and create slug
  base_slug := LOWER(TRIM(BOTH '-' FROM
    REGEXP_REPLACE(
      TRANSLATE(
        LOWER(TRIM(p_name)),
        'àâäéèêëïîôùûüÿçñ ',
        'aaaeeeeiioouuycn-'
      ),
      '[^a-z0-9-]+', '-', 'g'
    )
  ));

  -- Remove consecutive dashes
  base_slug := REGEXP_REPLACE(base_slug, '-+', '-', 'g');

  -- Ensure non-empty
  IF base_slug = '' OR base_slug IS NULL THEN
    base_slug := 'carte';
  END IF;

  final_slug := base_slug;

  -- Ensure uniqueness within tenant
  WHILE EXISTS (
    SELECT 1 FROM menus WHERE tenant_id = p_tenant_id AND slug = final_slug
  ) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  RETURN final_slug;
END;
$$;


ALTER FUNCTION "public"."generate_menu_slug"("p_tenant_id" "uuid", "p_name" "text") OWNER TO "postgres";

--
-- Name: get_category_breakdown("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_category_breakdown"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("category" "text", "revenue" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    c.name::TEXT AS category,
    SUM(oi.quantity * oi.price_at_order)::NUMERIC AS revenue
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  JOIN menu_items mi ON mi.id = oi.menu_item_id
  JOIN categories c ON c.id = mi.category_id
  WHERE o.tenant_id = p_tenant_id
    AND o.created_at >= p_start_date
    AND o.created_at <= p_end_date
    AND o.payment_status = 'paid'
  GROUP BY c.name
  ORDER BY revenue DESC;
END;
$$;


ALTER FUNCTION "public"."get_category_breakdown"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";

--
-- Name: get_co_ordered_items("uuid", "uuid"[], integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_co_ordered_items"("p_tenant_id" "uuid", "p_cart_ids" "uuid"[], "p_limit" integer DEFAULT 6) RETURNS TABLE("menu_item_id" "uuid", "frequency" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    oi2.menu_item_id,
    COUNT(*) AS frequency
  FROM order_items oi1
  INNER JOIN order_items oi2 ON oi1.order_id = oi2.order_id
  INNER JOIN orders o ON oi1.order_id = o.id
  WHERE oi1.menu_item_id = ANY(p_cart_ids)
    AND oi2.menu_item_id <> ALL(p_cart_ids)
    AND o.tenant_id = p_tenant_id
  GROUP BY oi2.menu_item_id
  ORDER BY frequency DESC, oi2.menu_item_id
  LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."get_co_ordered_items"("p_tenant_id" "uuid", "p_cart_ids" "uuid"[], "p_limit" integer) OWNER TO "postgres";

--
-- Name: get_daily_comps("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_daily_comps"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("day" "date", "comp_total" bigint, "comp_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT DATE(o.comped_at) AS day,
         COALESCE(SUM(o.comp_amount),0)::bigint AS comp_total,
         COUNT(o.id)::bigint AS comp_count
  FROM orders o
  WHERE o.tenant_id = p_tenant_id
    AND o.is_comp = true
    AND o.comped_at >= p_start_date AND o.comped_at <= p_end_date
  GROUP BY DATE(o.comped_at)
  ORDER BY day ASC;
END; $$;


ALTER FUNCTION "public"."get_daily_comps"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";

--
-- Name: get_daily_revenue("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_daily_revenue"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("day" "date", "revenue" numeric, "order_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT DATE(o.created_at) AS day,
    COALESCE(SUM(o.total + COALESCE(o.tip_amount, 0)), 0)::NUMERIC AS revenue,
    COUNT(o.id) AS order_count
  FROM orders o
  WHERE o.tenant_id = p_tenant_id AND o.created_at >= p_start_date AND o.created_at <= p_end_date
    AND o.status != 'cancelled' AND o.payment_status = 'paid'
  GROUP BY DATE(o.created_at) ORDER BY day ASC;
END; $$;


ALTER FUNCTION "public"."get_daily_revenue"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";

--
-- Name: get_house_account_balances("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_house_account_balances"("p_tenant_id" "uuid") RETURNS TABLE("account_id" "uuid", "name" "text", "status" "text", "open_orders" bigint, "outstanding" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT ha.id, ha.name, ha.status,
    COUNT(o.id) FILTER (
      WHERE o.payment_status NOT IN ('paid','comp') AND o.status <> 'cancelled'
    )::bigint AS open_orders,
    COALESCE(SUM(
      CASE WHEN o.payment_status NOT IN ('paid','comp') AND o.status <> 'cancelled'
        THEN (o.total + COALESCE(o.tip_amount,0))
             - COALESCE((SELECT SUM(CASE WHEN p.status='refunded' THEN -p.amount ELSE p.amount END)
                         FROM payments p WHERE p.order_id = o.id), 0)
        ELSE 0 END), 0)::bigint AS outstanding
  FROM house_accounts ha
  LEFT JOIN orders o ON o.house_account_id = ha.id AND o.tenant_id = ha.tenant_id
  WHERE ha.tenant_id = p_tenant_id
  GROUP BY ha.id, ha.name, ha.status, ha.created_at
  ORDER BY ha.created_at DESC;
END; $$;


ALTER FUNCTION "public"."get_house_account_balances"("p_tenant_id" "uuid") OWNER TO "postgres";

--
-- Name: get_losses_by_reason("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_losses_by_reason"("p_tenant_id" "uuid", "p_start" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_end" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE("reason_code" "text", "nb_movements" bigint, "total_qty" numeric, "total_cost_value" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    sm.reason_code,
    COUNT(*)::bigint,
    COALESCE(SUM(ABS(sm.quantity)), 0),
    COALESCE(SUM(ABS(sm.quantity) * i.cost_per_unit), 0)
  FROM public.stock_movements sm
  JOIN public.ingredients i
    ON i.id = sm.ingredient_id AND i.tenant_id = sm.tenant_id
  WHERE sm.tenant_id = p_tenant_id
    AND sm.movement_type = 'loss'
    AND (p_start IS NULL OR sm.created_at >= p_start)
    AND (p_end   IS NULL OR sm.created_at <= p_end)
  GROUP BY sm.reason_code
  ORDER BY 4 DESC;
END;
$$;


ALTER FUNCTION "public"."get_losses_by_reason"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) OWNER TO "postgres";

--
-- Name: get_my_tenant_ids(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_my_tenant_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select tenant_id
  from admin_users
  where user_id = auth.uid()
    and coalesce(is_active, true) = true
$$;


ALTER FUNCTION "public"."get_my_tenant_ids"() OWNER TO "postgres";

--
-- Name: get_my_tenant_ids_array(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_my_tenant_ids_array"() RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(array_agg(tenant_id), '{}')
  from admin_users
  where user_id = auth.uid()
    and coalesce(is_active, true) = true
$$;


ALTER FUNCTION "public"."get_my_tenant_ids_array"() OWNER TO "postgres";

--
-- Name: get_order_summary("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_order_summary"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("total_revenue" numeric, "total_orders" bigint, "avg_basket" numeric, "total_tax" numeric, "total_service_charge" numeric, "total_discounts" numeric, "total_tips" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT COALESCE(SUM(o.total + COALESCE(o.tip_amount, 0)), 0)::NUMERIC AS total_revenue,
    COUNT(o.id)::BIGINT AS total_orders,
    CASE WHEN COUNT(o.id) > 0 THEN ROUND(SUM(o.total + COALESCE(o.tip_amount, 0)) / COUNT(o.id), 2) ELSE 0 END::NUMERIC AS avg_basket,
    COALESCE(SUM(o.tax_amount), 0)::NUMERIC AS total_tax,
    COALESCE(SUM(o.service_charge_amount), 0)::NUMERIC AS total_service_charge,
    COALESCE(SUM(o.discount_amount), 0)::NUMERIC AS total_discounts,
    COALESCE(SUM(o.tip_amount), 0)::NUMERIC AS total_tips
  FROM orders o
  WHERE o.tenant_id = p_tenant_id AND o.created_at >= p_start_date AND o.created_at <= p_end_date
    AND o.status != 'cancelled' AND o.payment_status = 'paid';
END; $$;


ALTER FUNCTION "public"."get_order_summary"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";

--
-- Name: get_orders_for_tracking("uuid", "uuid"[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_orders_for_tracking"("p_tenant_id" "uuid", "p_order_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(o) ORDER BY o.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT
      ord.id,
      ord.order_number,
      ord.table_number,
      ord.status,
      ord.total,
      ord.subtotal,
      ord.tip_amount,
      ord.discount_amount,
      ord.tax_amount,
      ord.service_charge_amount,
      ord.service_type,
      ord.created_at,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'item_name', oi.item_name,
          'item_name_en', oi.item_name_en,
          'quantity', oi.quantity,
          'price_at_order', oi.price_at_order,
          'menu_item_id', oi.menu_item_id,
          'image_url', mi.image_url
        ))
        FROM order_items oi
        LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE oi.order_id = ord.id
      ), '[]'::jsonb) AS order_items
    FROM orders ord
    WHERE ord.tenant_id = p_tenant_id
      AND ord.id = ANY(p_order_ids)
  ) o;
$$;


ALTER FUNCTION "public"."get_orders_for_tracking"("p_tenant_id" "uuid", "p_order_ids" "uuid"[]) OWNER TO "postgres";

--
-- Name: get_owner_dashboard("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_owner_dashboard"("p_user_id" "uuid") RETURNS TABLE("tenant_id" "uuid", "tenant_name" "text", "tenant_slug" "text", "tenant_plan" "text", "tenant_status" "text", "tenant_logo_url" "text", "tenant_is_active" boolean, "orders_today" bigint, "revenue_today" numeric, "orders_month" bigint, "revenue_month" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.is_super_admin() OR p_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'access denied: cannot read dashboard for another user'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.slug,
    t.subscription_plan,
    t.subscription_status,
    t.logo_url,
    t.is_active,
    COUNT(o.id) FILTER (WHERE o.created_at >= CURRENT_DATE),
    COALESCE(SUM(o.total) FILTER (WHERE o.created_at >= CURRENT_DATE), 0),
    COUNT(o.id) FILTER (WHERE o.created_at >= date_trunc('month', CURRENT_DATE)),
    COALESCE(SUM(o.total) FILTER (WHERE o.created_at >= date_trunc('month', CURRENT_DATE)), 0)
  FROM restaurant_groups g
  JOIN tenants t ON t.group_id = g.id
  LEFT JOIN orders o ON o.tenant_id = t.id
  WHERE g.owner_user_id = p_user_id
  GROUP BY t.id, t.name, t.slug, t.subscription_plan, t.subscription_status, t.logo_url, t.is_active
  ORDER BY t.name;
END;
$$;


ALTER FUNCTION "public"."get_owner_dashboard"("p_user_id" "uuid") OWNER TO "postgres";

--
-- Name: get_server_performance("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_server_performance"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("server_id" "uuid", "server_name" "text", "orders" bigint, "revenue" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    o.server_id AS server_id,
    COALESCE(au.full_name, o.server_id::TEXT)::TEXT AS server_name,
    COUNT(o.id)::BIGINT AS orders,
    SUM(o.total + COALESCE(o.tip_amount, 0))::NUMERIC AS revenue
  FROM orders o
  LEFT JOIN admin_users au ON au.id = o.server_id
  WHERE o.tenant_id = p_tenant_id
    AND o.created_at >= p_start_date
    AND o.created_at <= p_end_date
    AND o.payment_status = 'paid'
    AND o.server_id IS NOT NULL
  GROUP BY o.server_id, au.full_name
  ORDER BY orders DESC;
END;
$$;


ALTER FUNCTION "public"."get_server_performance"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";

--
-- Name: get_staff_stock_report("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_staff_stock_report"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) RETURNS TABLE("author_id" "uuid", "author_name" "text", "out_qty" numeric, "in_qty" numeric, "movements_count" bigint, "manual_remove_qty" numeric, "adjustment_out_qty" numeric, "order_destock_qty" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    sm.created_by AS author_id,
    (SELECT au.full_name FROM public.admin_users au
       WHERE au.user_id = sm.created_by AND au.tenant_id = p_tenant_id
       LIMIT 1) AS author_name,
    COALESCE(SUM(CASE WHEN sm.quantity < 0 THEN -sm.quantity ELSE 0 END), 0) AS out_qty,
    COALESCE(SUM(CASE WHEN sm.quantity > 0 THEN  sm.quantity ELSE 0 END), 0) AS in_qty,
    COUNT(*) AS movements_count,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'manual_remove' THEN -sm.quantity ELSE 0 END), 0) AS manual_remove_qty,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'adjustment' AND sm.quantity < 0 THEN -sm.quantity ELSE 0 END), 0) AS adjustment_out_qty,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'order_destock' THEN -sm.quantity ELSE 0 END), 0) AS order_destock_qty
  FROM public.stock_movements sm
  WHERE sm.tenant_id = p_tenant_id
    AND sm.created_by IS NOT NULL
    AND sm.created_at >= p_start
    AND sm.created_at <  p_end
  GROUP BY sm.created_by
  ORDER BY out_qty DESC;
END;
$$;


ALTER FUNCTION "public"."get_staff_stock_report"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) OWNER TO "postgres";

--
-- Name: get_stock_movements_page("uuid", integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_stock_movements_page"("p_tenant_id" "uuid", "p_limit" integer DEFAULT 200, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "tenant_id" "uuid", "ingredient_id" "uuid", "movement_type" "text", "quantity" numeric, "reference_id" "uuid", "notes" "text", "reason_code" "text", "created_by" "uuid", "supplier_id" "uuid", "created_at" timestamp with time zone, "ingredient_name" "text", "ingredient_unit" "text", "supplier_name" "text", "author_name" "text", "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    sm.id, sm.tenant_id, sm.ingredient_id, sm.movement_type, sm.quantity,
    sm.reference_id, sm.notes, sm.reason_code, sm.created_by, sm.supplier_id, sm.created_at,
    (SELECT i.name FROM public.ingredients i WHERE i.id = sm.ingredient_id) AS ingredient_name,
    (SELECT i.unit FROM public.ingredients i WHERE i.id = sm.ingredient_id) AS ingredient_unit,
    (SELECT s.name FROM public.suppliers s WHERE s.id = sm.supplier_id) AS supplier_name,
    (SELECT au.full_name FROM public.admin_users au
       WHERE au.user_id = sm.created_by AND au.tenant_id = sm.tenant_id
       LIMIT 1) AS author_name,
    COUNT(*) OVER() AS total_count
  FROM public.stock_movements sm
  WHERE sm.tenant_id = p_tenant_id
  ORDER BY sm.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 200), 0)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;


ALTER FUNCTION "public"."get_stock_movements_page"("p_tenant_id" "uuid", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";

--
-- Name: get_stock_status("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_stock_status"("p_tenant_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "unit" "text", "current_stock" numeric, "min_stock_alert" numeric, "cost_per_unit" numeric, "category" "text", "is_active" boolean, "nb_items_using" bigint, "is_low" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    i.id, i.name, i.unit, i.current_stock, i.min_stock_alert,
    i.cost_per_unit, i.category, i.is_active,
    COUNT(DISTINCT r.menu_item_id) AS nb_items_using,
    (i.current_stock <= i.min_stock_alert AND i.min_stock_alert > 0) AS is_low
  FROM public.ingredients i
  LEFT JOIN public.recipes r ON r.ingredient_id = i.id AND r.tenant_id = p_tenant_id
  WHERE i.tenant_id = p_tenant_id AND i.is_active = true
  GROUP BY i.id, i.name, i.unit, i.current_stock, i.min_stock_alert,
           i.cost_per_unit, i.category, i.is_active
  ORDER BY i.name;
END;
$$;


ALTER FUNCTION "public"."get_stock_status"("p_tenant_id" "uuid") OWNER TO "postgres";

--
-- Name: get_tenant_by_slug("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_tenant_by_slug"("p_slug" "text") RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "logo_url" "text", "currency" "text", "tax_rate" numeric, "service_charge_rate" numeric, "enable_tax" boolean, "enable_service_charge" boolean, "establishment_type" "text", "is_active" boolean, "subscription_plan" "text", "subscription_status" "text", "trial_ends_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ SELECT t.id, t.name, t.slug, t.logo_url, t.currency, t.tax_rate, t.service_charge_rate, t.enable_tax, t.enable_service_charge, t.establishment_type, t.is_active, t.subscription_plan, t.subscription_status, t.trial_ends_at FROM tenants t WHERE t.slug = p_slug AND t.is_active = true LIMIT 1; $$;


ALTER FUNCTION "public"."get_tenant_by_slug"("p_slug" "text") OWNER TO "postgres";

--
-- Name: get_tenant_public_by_id("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_tenant_public_by_id"("p_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "currency" "text", "tax_rate" numeric, "service_charge_rate" numeric, "enable_tax" boolean, "enable_service_charge" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ SELECT t.id, t.name, t.slug, t.currency, t.tax_rate, t.service_charge_rate, t.enable_tax, t.enable_service_charge FROM tenants t WHERE t.id = p_id AND t.is_active = true LIMIT 1; $$;


ALTER FUNCTION "public"."get_tenant_public_by_id"("p_id" "uuid") OWNER TO "postgres";

--
-- Name: get_top_items("uuid", timestamp with time zone, timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_top_items"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer DEFAULT 10) RETURNS TABLE("item_id" "uuid", "item_name" "text", "quantity_sold" bigint, "revenue" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT oi.menu_item_id AS item_id, MAX(oi.item_name)::TEXT AS item_name,
    SUM(oi.quantity)::BIGINT AS quantity_sold,
    SUM(oi.quantity * oi.price_at_order)::NUMERIC AS revenue
  FROM order_items oi JOIN orders o ON o.id = oi.order_id
  WHERE o.tenant_id = p_tenant_id AND o.created_at >= p_start_date AND o.created_at <= p_end_date
    AND o.status != 'cancelled' AND o.payment_status = 'paid'
  GROUP BY oi.menu_item_id ORDER BY quantity_sold DESC LIMIT p_limit;
END; $$;


ALTER FUNCTION "public"."get_top_items"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer) OWNER TO "postgres";

--
-- Name: import_recipes_tx("uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."import_recipes_tx"("p_tenant_id" "uuid", "p_rows" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row jsonb;
  v_menu_item_id uuid;
  v_ing_name text;
  v_ing_unit text;
  v_qty numeric;
  v_notes text;
  v_ingredient_id uuid;
  v_existed boolean;
  v_recipes_created int := 0;
  v_recipes_updated int := 0;
  v_ingredients_created int := 0;
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);

  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb))
  LOOP
    v_menu_item_id := (v_row->>'menu_item_id')::uuid;
    v_ing_name     := btrim(v_row->>'ingredient_name');
    v_ing_unit     := v_row->>'unit';
    v_qty          := (v_row->>'quantity_needed')::numeric;
    v_notes        := NULLIF(btrim(COALESCE(v_row->>'notes','')), '');

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = '22023';
    END IF;
    IF v_ing_unit NOT IN ('kg','L','pièce','cl','g','bouteille') THEN
      RAISE EXCEPTION 'INVALID_UNIT: %', v_ing_unit USING ERRCODE = '22023';
    END IF;
    IF v_ing_name IS NULL OR v_ing_name = '' THEN
      RAISE EXCEPTION 'INVALID_INGREDIENT_NAME' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.menu_items mi
                   WHERE mi.id = v_menu_item_id AND mi.tenant_id = p_tenant_id) THEN
      RAISE EXCEPTION 'MENU_ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    SELECT id INTO v_ingredient_id
    FROM public.ingredients
    WHERE tenant_id = p_tenant_id AND lower(name) = lower(v_ing_name)
    ORDER BY is_active DESC, created_at
    LIMIT 1;

    IF v_ingredient_id IS NULL THEN
      INSERT INTO public.ingredients (tenant_id, name, unit)
      VALUES (p_tenant_id, v_ing_name, v_ing_unit)
      RETURNING id INTO v_ingredient_id;
      v_ingredients_created := v_ingredients_created + 1;
    END IF;

    SELECT EXISTS (SELECT 1 FROM public.recipes
                   WHERE menu_item_id = v_menu_item_id
                     AND ingredient_id = v_ingredient_id) INTO v_existed;

    INSERT INTO public.recipes (tenant_id, menu_item_id, ingredient_id, quantity_needed, notes)
    VALUES (p_tenant_id, v_menu_item_id, v_ingredient_id, v_qty, v_notes)
    ON CONFLICT (menu_item_id, ingredient_id)
    DO UPDATE SET quantity_needed = EXCLUDED.quantity_needed, notes = EXCLUDED.notes;

    IF v_existed THEN v_recipes_updated := v_recipes_updated + 1;
    ELSE v_recipes_created := v_recipes_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'recipes_created', v_recipes_created,
    'recipes_updated', v_recipes_updated,
    'ingredients_created', v_ingredients_created
  );
END;
$$;


ALTER FUNCTION "public"."import_recipes_tx"("p_tenant_id" "uuid", "p_rows" "jsonb") OWNER TO "postgres";

--
-- Name: increment_login_count("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."increment_login_count"("admin_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM admin_users
      WHERE id = admin_user_id AND user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'access denied: cannot update login count for another admin'
      USING ERRCODE = '42501';
  END IF;
  UPDATE admin_users
  SET last_login_at = NOW(),
      login_count = COALESCE(login_count, 0) + 1
  WHERE id = admin_user_id;
END;
$$;


ALTER FUNCTION "public"."increment_login_count"("admin_user_id" "uuid") OWNER TO "postgres";

--
-- Name: increment_menu_item_favorites("uuid", "uuid", integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."increment_menu_item_favorites"("p_item" "uuid", "p_tenant" "uuid", "p_delta" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_delta NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'p_delta must be -1 or 1';
  END IF;
  UPDATE menu_items
     SET favorite_count = GREATEST(0, favorite_count + p_delta)
   WHERE id = p_item AND tenant_id = p_tenant
   RETURNING favorite_count INTO v_count;
  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."increment_menu_item_favorites"("p_item" "uuid", "p_tenant" "uuid", "p_delta" integer) OWNER TO "postgres";

--
-- Name: is_super_admin(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ SELECT EXISTS ( SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND (is_super_admin = true OR role = 'super_admin') ); $$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";

--
-- Name: is_table_occupied("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_table_occupied"("p_tenant_id" "uuid", "p_table_number" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM table_sessions
    WHERE tenant_id = p_tenant_id
      AND table_number = p_table_number
      AND status = 'open'
  );
$$;


ALTER FUNCTION "public"."is_table_occupied"("p_tenant_id" "uuid", "p_table_number" "text") OWNER TO "postgres";

--
-- Name: next_order_number("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."next_order_number"("p_tenant_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_date TEXT;
  v_seq INTEGER;
  v_lock_key BIGINT;
BEGIN
  v_date := TO_CHAR(NOW(), 'YYYYMMDD');

  -- Advisory lock per tenant+date to prevent race conditions
  v_lock_key := ('x' || LEFT(MD5(p_tenant_id::TEXT || v_date), 15))::BIT(60)::BIGINT;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Get next sequence for this tenant + date
  SELECT COALESCE(MAX(
    NULLIF(
      SUBSTRING(order_number FROM 'CMD-\d{8}-(\d+)')::INTEGER,
      0
    )
  ), 0) + 1
  INTO v_seq
  FROM orders
  WHERE tenant_id = p_tenant_id
    AND order_number LIKE 'CMD-' || v_date || '-%';

  RETURN 'CMD-' || v_date || '-' || LPAD(v_seq::TEXT, 3, '0');
END;
$$;


ALTER FUNCTION "public"."next_order_number"("p_tenant_id" "uuid") OWNER TO "postgres";

--
-- Name: open_stock_count("uuid", "text", "uuid", "uuid"[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."open_stock_count"("p_tenant_id" "uuid", "p_reference" "text" DEFAULT NULL::"text", "p_created_by" "uuid" DEFAULT NULL::"uuid", "p_ingredient_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count_id uuid;
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  IF EXISTS (SELECT 1 FROM public.stock_counts WHERE tenant_id = p_tenant_id AND status = 'open') THEN
    RAISE EXCEPTION 'OPEN_COUNT_EXISTS' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.stock_counts (tenant_id, reference, status, created_by)
  VALUES (p_tenant_id, NULLIF(p_reference, ''), 'open', p_created_by)
  RETURNING id INTO v_count_id;

  INSERT INTO public.stock_count_lines (tenant_id, count_id, ingredient_id, theoretical_qty)
  SELECT p_tenant_id, v_count_id, i.id, i.current_stock
  FROM public.ingredients i
  WHERE i.tenant_id = p_tenant_id
    AND i.is_active = true
    AND (p_ingredient_ids IS NULL OR i.id = ANY (p_ingredient_ids));

  IF NOT EXISTS (SELECT 1 FROM public.stock_count_lines WHERE count_id = v_count_id) THEN
    RAISE EXCEPTION 'NO_INGREDIENTS' USING ERRCODE = '22023';
  END IF;

  RETURN v_count_id;
END;
$$;


ALTER FUNCTION "public"."open_stock_count"("p_tenant_id" "uuid", "p_reference" "text", "p_created_by" "uuid", "p_ingredient_ids" "uuid"[]) OWNER TO "postgres";

--
-- Name: prevent_super_admin_elevation(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."prevent_super_admin_elevation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  DECLARE
    caller_is_super_admin boolean := false;
    service_role_call boolean := false;
  BEGIN
    BEGIN
      service_role_call := coalesce(
        current_setting('request.jwt.claim.role', true) = 'service_role',
        false
      );
    EXCEPTION WHEN OTHERS THEN
      service_role_call := false;
    END;

    IF service_role_call THEN
      RETURN NEW;
    END IF;

    -- INSERT path
    IF TG_OP = 'INSERT' THEN
      IF NEW.role = 'super_admin' OR NEW.is_super_admin = true THEN
        SELECT coalesce(
          (SELECT au.is_super_admin
             FROM admin_users au
             WHERE au.user_id = auth.uid()
             LIMIT 1),
          false
        ) INTO caller_is_super_admin;

        IF NOT caller_is_super_admin THEN
          RAISE EXCEPTION
            'Only super_admin users can create a super_admin row'
            USING ERRCODE = '42501';
        END IF;
      END IF;
      RETURN NEW;
    END IF;

    -- UPDATE path
    IF (OLD.role IS NOT DISTINCT FROM NEW.role)
       AND (OLD.is_super_admin IS NOT DISTINCT FROM NEW.is_super_admin) THEN
      RETURN NEW;
    END IF;

    IF (NEW.role = 'super_admin' AND OLD.role IS DISTINCT FROM 'super_admin')
       OR (NEW.is_super_admin = true AND OLD.is_super_admin IS DISTINCT FROM true) THEN

      SELECT coalesce(
        (SELECT au.is_super_admin
           FROM admin_users au
           WHERE au.user_id = auth.uid()
           LIMIT 1),
        false
      ) INTO caller_is_super_admin;

      IF NOT caller_is_super_admin THEN
        RAISE EXCEPTION
          'Only super_admin users can grant super_admin privileges'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    IF (OLD.role = 'super_admin' AND NEW.role IS DISTINCT FROM 'super_admin')
       OR (OLD.is_super_admin = true AND NEW.is_super_admin IS DISTINCT FROM true) THEN

      SELECT coalesce(
        (SELECT au.is_super_admin
           FROM admin_users au
           WHERE au.user_id = auth.uid()
           LIMIT 1),
        false
      ) INTO caller_is_super_admin;

      IF NOT caller_is_super_admin THEN
        RAISE EXCEPTION
          'Only super_admin users can revoke super_admin privileges'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    RETURN NEW;
  END;
  $$;


ALTER FUNCTION "public"."prevent_super_admin_elevation"() OWNER TO "postgres";

--
-- Name: FUNCTION "prevent_super_admin_elevation"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."prevent_super_admin_elevation"() IS 'Blocks non-super_admin callers from granting or revoking super_admin
     role/is_super_admin flag via UPDATE. Service role bypasses.';


--
-- Name: provision_group_restaurant("uuid", "uuid", "text", "text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."provision_group_restaurant"("p_group_id" "uuid", "p_user_id" "uuid", "p_email" "text", "p_name" "text", "p_slug" "text", "p_type" "text", "p_plan" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_owner uuid;
  v_plan text := CASE WHEN p_plan = 'trial' THEN 'starter' ELSE p_plan END;
  v_status text := CASE WHEN p_plan = 'trial' THEN 'trial' ELSE 'pending' END;
  v_trial_ends timestamptz := CASE WHEN p_plan = 'trial' THEN now() + interval '14 days' ELSE NULL END;
BEGIN
  SELECT owner_user_id INTO v_owner FROM restaurant_groups WHERE id = p_group_id;
  IF v_owner IS NULL OR v_owner <> p_user_id THEN
    RAISE EXCEPTION 'group_not_owned_by_user' USING ERRCODE = '42501';
  END IF;

  INSERT INTO tenants (slug, name, group_id, subscription_plan, subscription_status, trial_ends_at, is_active)
  VALUES (p_slug, p_name, p_group_id, v_plan, v_status, v_trial_ends, true)
  RETURNING id INTO v_tenant_id;

  INSERT INTO admin_users (tenant_id, user_id, email, full_name, role, is_active)
  VALUES (v_tenant_id, p_user_id, p_email, p_name, 'owner', true);

  INSERT INTO venues (tenant_id, slug, name, name_en, type, is_active)
  VALUES (v_tenant_id, 'main', 'Salle principale', 'Main Dining', p_type, true);

  RETURN jsonb_build_object('tenantId', v_tenant_id, 'slug', p_slug);
END;
$$;


ALTER FUNCTION "public"."provision_group_restaurant"("p_group_id" "uuid", "p_user_id" "uuid", "p_email" "text", "p_name" "text", "p_slug" "text", "p_type" "text", "p_plan" "text") OWNER TO "postgres";

--
-- Name: provision_signup_tenant("text", "text", "text", "uuid", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."provision_signup_tenant"("p_slug" "text", "p_name" "text", "p_plan" "text", "p_user_id" "uuid", "p_email" "text", "p_full_name" "text", "p_phone" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_group_id uuid;
  v_trial_ends timestamptz := now() + interval '14 days';
BEGIN
  INSERT INTO tenants (
    slug,
    name,
    subscription_plan,
    subscription_status,
    trial_ends_at,
    is_active
  ) VALUES (
    p_slug,
    p_name,
    p_plan,
    'trial',
    v_trial_ends,
    true
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO restaurant_groups (owner_user_id, name)
  VALUES (p_user_id, 'Mon Groupe')
  ON CONFLICT (owner_user_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_group_id;

  IF v_group_id IS NULL THEN
    SELECT id INTO v_group_id FROM restaurant_groups WHERE owner_user_id = p_user_id;
  END IF;

  UPDATE tenants
  SET group_id = v_group_id
  WHERE id = v_tenant_id;

  INSERT INTO admin_users (
    tenant_id,
    user_id,
    email,
    full_name,
    phone,
    role,
    is_active
  ) VALUES (
    v_tenant_id,
    p_user_id,
    p_email,
    p_full_name,
    p_phone,
    'owner',
    true
  );

  INSERT INTO venues (tenant_id, slug, name, name_en, type, is_active)
  VALUES (v_tenant_id, 'main', 'Salle principale', 'Main Dining', 'restaurant', true);

  RETURN jsonb_build_object(
    'tenantId', v_tenant_id,
    'slug', p_slug,
    'groupId', v_group_id
  );
END;
$$;


ALTER FUNCTION "public"."provision_signup_tenant"("p_slug" "text", "p_name" "text", "p_plan" "text", "p_user_id" "uuid", "p_email" "text", "p_full_name" "text", "p_phone" "text") OWNER TO "postgres";

--
-- Name: reassign_order_table("uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."reassign_order_table"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_new_table_number" "text") RETURNS "void"
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
  PERFORM public.assert_tenant_member(p_tenant_id);

  SELECT table_number, session_id, service_type, status
    INTO v_old_table_number, v_old_session_id, v_service_type, v_status
    FROM orders
    WHERE id = p_order_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_service_type IS DISTINCT FROM 'dine_in' THEN
    RAISE EXCEPTION 'Only dine-in orders can be reassigned' USING ERRCODE = 'check_violation';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot reassign a cancelled order' USING ERRCODE = 'check_violation';
  END IF;

  IF p_new_table_number IS NULL OR btrim(p_new_table_number) = '' THEN
    RAISE EXCEPTION 'Destination table number is required' USING ERRCODE = 'check_violation';
  END IF;

  IF v_old_table_number IS NOT DISTINCT FROM p_new_table_number THEN
    RETURN;
  END IF;

  IF v_old_table_number IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || p_new_table_number));
  ELSIF v_old_table_number < p_new_table_number THEN
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || v_old_table_number));
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || p_new_table_number));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || p_new_table_number));
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || v_old_table_number));
  END IF;

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

  UPDATE orders
    SET table_number = p_new_table_number,
        session_id = v_new_session_id
    WHERE id = p_order_id AND tenant_id = p_tenant_id;

  IF v_old_session_id IS NOT NULL AND v_old_session_id IS DISTINCT FROM v_new_session_id THEN
    SELECT count(*) INTO v_pending_count
      FROM orders
      WHERE tenant_id = p_tenant_id
        AND session_id = v_old_session_id
        AND payment_status = 'pending'
        AND status <> 'cancelled';

    IF v_pending_count = 0 THEN
      UPDATE table_sessions
        SET status = 'closed', closed_at = now()
        WHERE id = v_old_session_id AND status = 'open';
    END IF;
  END IF;
END;
$$;


ALTER FUNCTION "public"."reassign_order_table"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_new_table_number" "text") OWNER TO "postgres";

--
-- Name: reconcile_stock_ledger("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."reconcile_stock_ledger"("p_tenant_id" "uuid", "p_created_by" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row RECORD;
  v_n INT := 0;
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  FOR v_row IN
    SELECT i.id, (i.current_stock - COALESCE(SUM(sm.quantity), 0))::numeric(10, 3) AS drift
    FROM public.ingredients i
    LEFT JOIN public.stock_movements sm
      ON sm.ingredient_id = i.id AND sm.tenant_id = p_tenant_id
    WHERE i.tenant_id = p_tenant_id AND i.is_active = true
    GROUP BY i.id, i.current_stock
    HAVING (i.current_stock - COALESCE(SUM(sm.quantity), 0)) <> 0
  LOOP
    INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, notes, created_by, reason_code)
    VALUES (p_tenant_id, v_row.id, 'adjustment', v_row.drift, 'Reconciliation ledger', p_created_by, 'reconcile');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;


ALTER FUNCTION "public"."reconcile_stock_ledger"("p_tenant_id" "uuid", "p_created_by" "uuid") OWNER TO "postgres";

--
-- Name: record_loss_tx("uuid", "uuid", numeric, "text", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."record_loss_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_reason_code" "text", "p_notes" "text" DEFAULT NULL::"text", "p_created_by" "uuid" DEFAULT NULL::"uuid") RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_before NUMERIC(10,3);
  v_after  NUMERIC(10,3);
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = '22023';
  END IF;
  IF p_reason_code IS NULL OR p_reason_code NOT IN
     ('breakage','expired','theft','spillage','prep_waste','other') THEN
    RAISE EXCEPTION 'INVALID_REASON' USING ERRCODE = '22023';
  END IF;

  SELECT current_stock INTO v_before
  FROM public.ingredients
  WHERE id = p_ingredient_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INGREDIENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_after := GREATEST(0, v_before - p_quantity);

  UPDATE public.ingredients
  SET current_stock = v_after, updated_at = now()
  WHERE id = p_ingredient_id AND tenant_id = p_tenant_id;

  INSERT INTO public.stock_movements
    (tenant_id, ingredient_id, movement_type, quantity, reason_code, notes, created_by)
  VALUES
    (p_tenant_id, p_ingredient_id, 'loss', v_after - v_before, p_reason_code, p_notes, p_created_by);

  IF v_after <= 0 THEN
    UPDATE public.menu_items
    SET is_available = false
    WHERE id IN (
      SELECT r.menu_item_id FROM public.recipes r
      WHERE r.ingredient_id = p_ingredient_id AND r.tenant_id = p_tenant_id
    )
    AND tenant_id = p_tenant_id AND is_available = true;
  END IF;

  RETURN v_after;
END;
$$;


ALTER FUNCTION "public"."record_loss_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_reason_code" "text", "p_notes" "text", "p_created_by" "uuid") OWNER TO "postgres";

--
-- Name: record_refund("uuid", "uuid", numeric, "text", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."record_refund"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_amount" numeric, "p_method" "text", "p_created_by" "uuid" DEFAULT NULL::"uuid", "p_client_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
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


ALTER FUNCTION "public"."record_refund"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_amount" numeric, "p_method" "text", "p_created_by" "uuid", "p_client_request_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "record_refund"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_amount" numeric, "p_method" "text", "p_created_by" "uuid", "p_client_request_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."record_refund"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_amount" numeric, "p_method" "text", "p_created_by" "uuid", "p_client_request_id" "uuid") IS 'Enregistre un remboursement. Verifie l''appartenance au restaurant, le role et orders.manage, et derive created_by de auth.uid(): les parametres p_tenant_id et p_created_by ne sont plus crus sur parole. Voir 20261105120000_record_refund_tenant_guard.sql.';


--
-- Name: reset_tenant_data("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."reset_tenant_data"("p_tenant_id" "uuid", "p_reset_type" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  DECLARE
    orders_deleted int := 0;
    items_deleted int := 0;
    movements_deleted int := 0;
    coupons_reset int := 0;
  BEGIN
    IF p_tenant_id IS NULL THEN
      RAISE EXCEPTION 'p_tenant_id is required' USING ERRCODE = '22023';
    END IF;

    IF p_reset_type NOT IN ('orders', 'statistics', 'all') THEN
      RAISE EXCEPTION 'Invalid reset_type: %', p_reset_type USING ERRCODE = '22023';
    END IF;

    IF p_reset_type = 'orders' THEN
      WITH del_items AS (
        DELETE FROM order_items oi USING orders o
        WHERE oi.order_id = o.id AND o.tenant_id = p_tenant_id
        RETURNING 1
      ) SELECT count(*) INTO items_deleted FROM del_items;
      WITH del_orders AS (
        DELETE FROM orders WHERE tenant_id = p_tenant_id RETURNING 1
      ) SELECT count(*) INTO orders_deleted FROM del_orders;

    ELSIF p_reset_type = 'statistics' THEN
      WITH del_items AS (
        DELETE FROM order_items oi USING orders o
        WHERE oi.order_id = o.id AND o.tenant_id = p_tenant_id
          AND o.status IN ('delivered', 'cancelled')
        RETURNING 1
      ) SELECT count(*) INTO items_deleted FROM del_items;
      WITH del_orders AS (
        DELETE FROM orders WHERE tenant_id = p_tenant_id
          AND status IN ('delivered', 'cancelled') RETURNING 1
      ) SELECT count(*) INTO orders_deleted FROM del_orders;

    ELSIF p_reset_type = 'all' THEN
      WITH del_items AS (
        DELETE FROM order_items oi USING orders o
        WHERE oi.order_id = o.id AND o.tenant_id = p_tenant_id
        RETURNING 1
      ) SELECT count(*) INTO items_deleted FROM del_items;
      WITH del_orders AS (
        DELETE FROM orders WHERE tenant_id = p_tenant_id RETURNING 1
      ) SELECT count(*) INTO orders_deleted FROM del_orders;
      WITH del_mov AS (
        DELETE FROM inventory_movements WHERE tenant_id = p_tenant_id RETURNING 1
      ) SELECT count(*) INTO movements_deleted FROM del_mov;
      WITH upd_coupons AS (
        UPDATE coupons SET current_uses = 0 WHERE tenant_id = p_tenant_id RETURNING 1
      ) SELECT count(*) INTO coupons_reset FROM upd_coupons;
    END IF;

    RETURN json_build_object(
      'reset_type', p_reset_type,
      'orders_deleted', orders_deleted,
      'items_deleted', items_deleted,
      'movements_deleted', movements_deleted,
      'coupons_reset', coupons_reset
    );
  END;
  $$;


ALTER FUNCTION "public"."reset_tenant_data"("p_tenant_id" "uuid", "p_reset_type" "text") OWNER TO "postgres";

--
-- Name: restock_order("uuid", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."restock_order"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count INT := 0;
  v_mov RECORD;
  v_new_stock NUMERIC(10,3);
BEGIN
  FOR v_mov IN
    SELECT sm.ingredient_id, SUM(sm.quantity) AS net_destocked
    FROM public.stock_movements sm
    WHERE sm.reference_id = p_order_id
      AND sm.tenant_id = p_tenant_id
      AND sm.movement_type = 'order_destock'
    GROUP BY sm.ingredient_id
    HAVING SUM(sm.quantity) < 0
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.stock_movements r
      WHERE r.reference_id = p_order_id
        AND r.tenant_id = p_tenant_id
        AND r.movement_type = 'order_restock'
        AND r.ingredient_id = v_mov.ingredient_id
    ) THEN
      CONTINUE;
    END IF;

    UPDATE public.ingredients
    SET current_stock = current_stock + ABS(v_mov.net_destocked)
    WHERE id = v_mov.ingredient_id
      AND tenant_id = p_tenant_id
    RETURNING current_stock INTO v_new_stock;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, reference_id, notes, created_by)
    VALUES (
      p_tenant_id, v_mov.ingredient_id, 'order_restock',
      ABS(v_mov.net_destocked), p_order_id, 'Annulation / remboursement commande', p_created_by
    );

    IF v_new_stock > 0 THEN
      UPDATE public.menu_items
      SET is_available = true
      WHERE id IN (
        SELECT r2.menu_item_id FROM public.recipes r2
        WHERE r2.ingredient_id = v_mov.ingredient_id AND r2.tenant_id = p_tenant_id
      )
      AND tenant_id = p_tenant_id AND is_available = false;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."restock_order"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid") OWNER TO "postgres";

--
-- Name: save_stock_count_lines("uuid", "uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."save_stock_count_lines"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_lines" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_line jsonb;
  v_status text;
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  SELECT status INTO v_status FROM public.stock_counts
    WHERE id = p_count_id AND tenant_id = p_tenant_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COUNT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'COUNT_NOT_OPEN' USING ERRCODE = '22023'; END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
  LOOP
    IF (v_line->>'counted_qty') IS NOT NULL AND (v_line->>'counted_qty')::numeric < 0 THEN
      RAISE EXCEPTION 'INVALID_COUNTED_QTY' USING ERRCODE = '22023';
    END IF;
    UPDATE public.stock_count_lines
      SET counted_qty = NULLIF(v_line->>'counted_qty', '')::numeric
      WHERE count_id = p_count_id
        AND tenant_id = p_tenant_id
        AND ingredient_id = (v_line->>'ingredient_id')::uuid;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."save_stock_count_lines"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_lines" "jsonb") OWNER TO "postgres";

--
-- Name: set_opening_stock("uuid", "uuid", numeric, "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."set_opening_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_created_by" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_before NUMERIC(10,3);
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  -- Lock the row and read the prior value so the ledger records the DELTA,
  -- keeping SUM(stock_movements.quantity) == ingredients.current_stock.
  SELECT current_stock INTO v_before
  FROM public.ingredients
  WHERE id = p_ingredient_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INGREDIENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.ingredients
  SET current_stock = p_quantity, updated_at = now()
  WHERE id = p_ingredient_id AND tenant_id = p_tenant_id;

  INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, notes, created_by)
  VALUES (p_tenant_id, p_ingredient_id, 'opening', p_quantity - v_before, 'Stock d''ouverture', p_created_by);
END;
$$;


ALTER FUNCTION "public"."set_opening_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_created_by" "uuid") OWNER TO "postgres";

--
-- Name: set_order_item_tenant_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."set_order_item_tenant_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    SELECT o.tenant_id INTO NEW.tenant_id FROM public.orders o WHERE o.id = NEW.order_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_order_item_tenant_id"() OWNER TO "postgres";

--
-- Name: set_qr_designs_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."set_qr_designs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_qr_designs_updated_at"() OWNER TO "postgres";

--
-- Name: set_recipe_tx("uuid", "uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."set_recipe_tx"("p_tenant_id" "uuid", "p_menu_item_id" "uuid", "p_lines" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_line jsonb; v_ingredient_id uuid; v_qty numeric;
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  IF NOT EXISTS (SELECT 1 FROM public.menu_items mi WHERE mi.id = p_menu_item_id AND mi.tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'MENU_ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
  LOOP
    v_ingredient_id := (v_line->>'ingredient_id')::uuid;
    v_qty := (v_line->>'quantity_needed')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ingredients i WHERE i.id = v_ingredient_id AND i.tenant_id = p_tenant_id AND i.is_active = true) THEN
      RAISE EXCEPTION 'INVALID_INGREDIENT' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  DELETE FROM public.recipes WHERE menu_item_id = p_menu_item_id AND tenant_id = p_tenant_id;
  INSERT INTO public.recipes (tenant_id, menu_item_id, ingredient_id, quantity_needed, notes)
  SELECT p_tenant_id, p_menu_item_id, (line->>'ingredient_id')::uuid, (line->>'quantity_needed')::numeric, NULLIF(line->>'notes','')
  FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) AS line;
END; $$;


ALTER FUNCTION "public"."set_recipe_tx"("p_tenant_id" "uuid", "p_menu_item_id" "uuid", "p_lines" "jsonb") OWNER TO "postgres";

--
-- Name: set_trial_end_date(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."set_trial_end_date"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.subscription_status = 'trial' AND NEW.trial_ends_at IS NULL THEN
    NEW.trial_ends_at := NOW() + INTERVAL '14 days';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_trial_end_date"() OWNER TO "postgres";

--
-- Name: unclaim_coupon_usage("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."unclaim_coupon_usage"("p_coupon_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM coupons c
      WHERE c.id = p_coupon_id
        AND c.tenant_id = ANY (public.get_my_tenant_ids_array())
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


ALTER FUNCTION "public"."unclaim_coupon_usage"("p_coupon_id" "uuid") OWNER TO "postgres";

--
-- Name: update_ingredients_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_ingredients_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_ingredients_updated_at"() OWNER TO "postgres";

--
-- Name: update_menus_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_menus_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_menus_updated_at"() OWNER TO "postgres";

--
-- Name: update_suppliers_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_suppliers_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_suppliers_updated_at"() OWNER TO "postgres";

--
-- Name: update_tenant_supports_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_tenant_supports_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin new.updated_at = now(); return new; end; $$;


ALTER FUNCTION "public"."update_tenant_supports_updated_at"() OWNER TO "postgres";

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

--
-- Name: update_user_preferences_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_user_preferences_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_user_preferences_updated_at"() OWNER TO "postgres";

--
-- Name: verify_stock_ledger("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."verify_stock_ledger"("p_tenant_id" "uuid") RETURNS TABLE("ingredient_id" "uuid", "name" "text", "current_stock" numeric, "ledger_sum" numeric, "drift" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    i.id,
    i.name,
    i.current_stock,
    COALESCE(SUM(sm.quantity), 0)::numeric(10, 3),
    (i.current_stock - COALESCE(SUM(sm.quantity), 0))::numeric(10, 3)
  FROM public.ingredients i
  LEFT JOIN public.stock_movements sm
    ON sm.ingredient_id = i.id AND sm.tenant_id = p_tenant_id
  WHERE i.tenant_id = p_tenant_id AND i.is_active = true
  GROUP BY i.id, i.name, i.current_stock
  HAVING (i.current_stock - COALESCE(SUM(sm.quantity), 0)) <> 0
  ORDER BY i.name;
END;
$$;


ALTER FUNCTION "public"."verify_stock_ledger"("p_tenant_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."admin_users" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "role" "text" DEFAULT 'admin'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "last_login" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "is_super_admin" boolean DEFAULT false,
    "phone" character varying(50),
    "last_login_at" timestamp with time zone,
    "login_count" integer DEFAULT 0,
    "custom_permissions" "jsonb",
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "banned_at" timestamp with time zone,
    "banned_by" "uuid",
    "ban_reason" "text",
    CONSTRAINT "admin_users_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'cashier'::"text", 'chef'::"text", 'waiter'::"text", 'super_admin'::"text"])))
);


ALTER TABLE "public"."admin_users" OWNER TO "postgres";

--
-- Name: ads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "image_url" "text" NOT NULL,
    "link" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ads" OWNER TO "postgres";

--
-- Name: ai_credits_ledger; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ai_credits_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "delta" integer NOT NULL,
    "reason" "text" NOT NULL,
    "external_ref" "text",
    "menu_item_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ai_credits_ledger_reason_check" CHECK (("reason" = ANY (ARRAY['purchase_stripe'::"text", 'purchase_wave'::"text", 'purchase_orange_money'::"text", 'monthly_grant'::"text", 'remove_bg'::"text", 'bg_gen'::"text", 'refund'::"text", 'admin_adjustment'::"text"])))
);


ALTER TABLE "public"."ai_credits_ledger" OWNER TO "postgres";

--
-- Name: ai_photo_credits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ai_photo_credits" (
    "tenant_id" "uuid" NOT NULL,
    "balance" integer DEFAULT 0 NOT NULL,
    "monthly_grant" integer DEFAULT 0 NOT NULL,
    "last_grant_at" timestamp with time zone,
    "lifetime_used" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ai_photo_credits_balance_check" CHECK (("balance" >= 0))
);


ALTER TABLE "public"."ai_photo_credits" OWNER TO "postgres";

--
-- Name: announcements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "title_en" "text",
    "description" "text",
    "description_en" "text",
    "image_url" "text",
    "start_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "end_date" timestamp with time zone,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."announcements" OWNER TO "postgres";

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid",
    "user_id" "uuid",
    "user_email" "text",
    "user_role" "text",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "old_data" "jsonb",
    "new_data" "jsonb",
    "metadata" "jsonb"
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";

--
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."categories" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "venue_id" "uuid",
    "name" "text" NOT NULL,
    "name_en" "text",
    "description" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "menu_id" "uuid",
    "preparation_zone" "text" DEFAULT 'kitchen'::"text" NOT NULL,
    "is_featured_on_home" boolean DEFAULT false NOT NULL,
    "icon" "text",
    "image_url" "text",
    CONSTRAINT "categories_preparation_zone_check" CHECK (("preparation_zone" = ANY (ARRAY['kitchen'::"text", 'bar'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."categories" OWNER TO "postgres";

--
-- Name: COLUMN "categories"."is_featured_on_home"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."categories"."is_featured_on_home" IS 'When TRUE, this category is displayed in the client home shortcut grid. Restaurateurs pick explicitly which categories to highlight.';


--
-- Name: coupon_redemptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."coupon_redemptions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "coupon_id" "uuid",
    "order_id" "uuid",
    "discount_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coupon_redemptions" OWNER TO "postgres";

--
-- Name: coupons; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."coupons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "code" character varying(50) NOT NULL,
    "discount_type" character varying(20) NOT NULL,
    "discount_value" numeric(10,2) NOT NULL,
    "min_order_amount" numeric(10,2) DEFAULT 0,
    "max_discount_amount" numeric(10,2),
    "valid_from" timestamp with time zone DEFAULT "now"(),
    "valid_until" timestamp with time zone,
    "max_uses" integer,
    "current_uses" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "coupons_discount_type_check" CHECK ((("discount_type")::"text" = ANY ((ARRAY['percentage'::character varying, 'fixed'::character varying])::"text"[]))),
    CONSTRAINT "coupons_discount_value_check" CHECK (("discount_value" >= (0)::numeric))
);


ALTER TABLE "public"."coupons" OWNER TO "postgres";

--
-- Name: dish_photo_drafts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."dish_photo_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "public_url" "text",
    "device_id" "text",
    "exif_taken_at" timestamp with time zone,
    "attached_menu_item_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "dish_photo_drafts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'attached'::"text", 'discarded'::"text"])))
);


ALTER TABLE "public"."dish_photo_drafts" OWNER TO "postgres";

--
-- Name: house_accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."house_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "settled_at" timestamp with time zone,
    "settled_by" "uuid",
    CONSTRAINT "house_accounts_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'settled'::"text"])))
);


ALTER TABLE "public"."house_accounts" OWNER TO "postgres";

--
-- Name: ingredients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "unit" "text" DEFAULT 'pièce'::"text" NOT NULL,
    "current_stock" numeric(10,3) DEFAULT 0 NOT NULL,
    "min_stock_alert" numeric(10,3) DEFAULT 0 NOT NULL,
    "cost_per_unit" numeric(10,2) DEFAULT 0 NOT NULL,
    "category" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "purchase_unit" "text",
    "units_per_purchase" numeric(10,3) DEFAULT 1 NOT NULL,
    CONSTRAINT "ingredients_unit_check" CHECK (("unit" = ANY (ARRAY['kg'::"text", 'L'::"text", 'pièce'::"text", 'cl'::"text", 'g'::"text", 'bouteille'::"text"]))),
    CONSTRAINT "ingredients_units_per_purchase_positive" CHECK (("units_per_purchase" > (0)::numeric))
);


ALTER TABLE "public"."ingredients" OWNER TO "postgres";

--
-- Name: COLUMN "ingredients"."purchase_unit"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ingredients"."purchase_unit" IS 'Optional purchasing-unit label (casier, sac, carton). NULL = purchased in base unit.';


--
-- Name: COLUMN "ingredients"."units_per_purchase"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ingredients"."units_per_purchase" IS 'Base units (ingredients.unit) contained in one purchase_unit. Default 1.';


--
-- Name: invitations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "custom_permissions" "jsonb",
    "invited_by" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_at" timestamp with time zone,
    CONSTRAINT "invitations_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'manager'::"text", 'cashier'::"text", 'chef'::"text", 'waiter'::"text"]))),
    CONSTRAINT "invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."invitations" OWNER TO "postgres";

--
-- Name: item_modifiers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."item_modifiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "name" character varying(200) NOT NULL,
    "name_en" character varying(200),
    "price" numeric(10,2) DEFAULT 0,
    "is_available" boolean DEFAULT true,
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "prices" "jsonb",
    CONSTRAINT "item_modifiers_price_check" CHECK (("price" >= (0)::numeric))
);


ALTER TABLE "public"."item_modifiers" OWNER TO "postgres";

--
-- Name: item_options; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."item_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "name_fr" "text" NOT NULL,
    "name_en" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."item_options" OWNER TO "postgres";

--
-- Name: item_price_variants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."item_price_variants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "variant_name_fr" "text" NOT NULL,
    "variant_name_en" "text",
    "price" numeric(10,2) DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0,
    "prices" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."item_price_variants" OWNER TO "postgres";

--
-- Name: item_suggestions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."item_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "suggested_item_id" "uuid" NOT NULL,
    "suggestion_type" "text" DEFAULT 'pairing'::"text" NOT NULL,
    "description" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "item_suggestions_check" CHECK (("menu_item_id" <> "suggested_item_id")),
    CONSTRAINT "item_suggestions_suggestion_type_check" CHECK (("suggestion_type" = ANY (ARRAY['pairing'::"text", 'upsell'::"text", 'alternative'::"text"])))
);


ALTER TABLE "public"."item_suggestions" OWNER TO "postgres";

--
-- Name: menu_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."menu_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "name_en" "text",
    "description" "text",
    "description_en" "text",
    "price" numeric(10,2) NOT NULL,
    "image_url" "text",
    "is_available" boolean DEFAULT true NOT NULL,
    "is_featured" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "prices" "jsonb",
    "allergens" "text"[] DEFAULT '{}'::"text"[],
    "calories" integer,
    "image_uploaded_at" timestamp with time zone,
    "image_uploaded_by" "uuid",
    "image_source" "text" DEFAULT 'web'::"text",
    "image_ai_processed" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "rating" numeric(2,1),
    "rating_count" integer DEFAULT 0 NOT NULL,
    "is_vegetarian" boolean DEFAULT false NOT NULL,
    "is_spicy" boolean DEFAULT false NOT NULL,
    "favorite_count" integer DEFAULT 0 NOT NULL,
    "options_title_fr" "text",
    "options_title_en" "text",
    "images" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "menu_items_favorite_count_check" CHECK (("favorite_count" >= 0)),
    CONSTRAINT "menu_items_image_source_check" CHECK (("image_source" = ANY (ARRAY['web'::"text", 'at_food_ios'::"text", 'import'::"text", 'ai_generated'::"text"]))),
    CONSTRAINT "menu_items_rating_check" CHECK ((("rating" IS NULL) OR (("rating" >= (0)::numeric) AND ("rating" <= (5)::numeric)))),
    CONSTRAINT "menu_items_rating_count_check" CHECK (("rating_count" >= 0))
);


ALTER TABLE "public"."menu_items" OWNER TO "postgres";

--
-- Name: menus; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."menus" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "venue_id" "uuid",
    "parent_menu_id" "uuid",
    "name" "text" NOT NULL,
    "name_en" "text",
    "slug" "text" NOT NULL,
    "description" "text",
    "description_en" "text",
    "image_url" "text",
    "is_active" boolean DEFAULT true,
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_transversal_menu" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."menus" OWNER TO "postgres";

--
-- Name: COLUMN "menus"."is_transversal_menu"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."menus"."is_transversal_menu" IS 'When TRUE, this menu (carte) is exposed as a sub-tab on every other top-level menu in the client UI.';


--
-- Name: newsletter_subscriber; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."newsletter_subscriber" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."newsletter_subscriber" OWNER TO "postgres";

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "type" "text" DEFAULT 'info'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "link" "text",
    "read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";

--
-- Name: onboarding_progress; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."onboarding_progress" (
    "tenant_id" "uuid" NOT NULL,
    "step" integer DEFAULT 1,
    "completed" boolean DEFAULT false,
    "completed_at" timestamp without time zone,
    "draft" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    CONSTRAINT "onboarding_progress_step_check" CHECK ((("step" >= 1) AND ("step" <= 6)))
);


ALTER TABLE "public"."onboarding_progress" OWNER TO "postgres";

--
-- Name: orange_money_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."orange_money_events" (
    "id" "text" NOT NULL,
    "status" "text" NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."orange_money_events" OWNER TO "postgres";

--
-- Name: TABLE "orange_money_events"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."orange_money_events" IS 'Idempotency log for Orange Money callback events. INSERT ON CONFLICT detects replays.';


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."order_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "price_at_order" bigint NOT NULL,
    "item_name" "text" NOT NULL,
    "item_name_en" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "item_status" character varying(20) DEFAULT 'pending'::character varying,
    "course" character varying(20),
    "modifiers" "jsonb" DEFAULT '[]'::"jsonb",
    "customer_notes" "text",
    "preparation_zone" "text" DEFAULT 'kitchen'::"text" NOT NULL,
    "selected_option" "jsonb",
    "selected_variant" "jsonb",
    "tenant_id" "uuid" NOT NULL,
    "held" boolean DEFAULT false NOT NULL,
    "fired_at" timestamp with time zone,
    CONSTRAINT "order_items_course_check" CHECK ((("course" IS NULL) OR (("course")::"text" = ANY ((ARRAY['appetizer'::character varying, 'main'::character varying, 'dessert'::character varying, 'drink'::character varying])::"text"[])))),
    CONSTRAINT "order_items_item_status_check" CHECK ((("item_status")::"text" = ANY ((ARRAY['pending'::character varying, 'preparing'::character varying, 'ready'::character varying, 'served'::character varying])::"text"[]))),
    CONSTRAINT "order_items_preparation_zone_check" CHECK (("preparation_zone" = ANY (ARRAY['kitchen'::"text", 'bar'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";

--
-- Name: COLUMN "order_items"."preparation_zone"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."order_items"."preparation_zone" IS 'Preparation zone copied from the item category at order time: kitchen, bar, or both';


--
-- Name: order_mutation_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."order_mutation_requests" (
    "client_request_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone
);


ALTER TABLE "public"."order_mutation_requests" OWNER TO "postgres";

--
-- Name: order_notes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."order_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "note" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_notes" OWNER TO "postgres";

--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."orders" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "venue_id" "uuid",
    "order_number" "text" NOT NULL,
    "table_number" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "subtotal" bigint NOT NULL,
    "total" bigint NOT NULL,
    "customer_name" "text",
    "customer_phone" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "service_type" character varying(20) DEFAULT 'dine_in'::character varying,
    "room_number" character varying(20),
    "delivery_address" "text",
    "tax_amount" bigint DEFAULT 0,
    "service_charge_amount" bigint DEFAULT 0,
    "discount_amount" bigint DEFAULT 0,
    "payment_method" character varying(20),
    "payment_status" character varying(20) DEFAULT 'pending'::character varying,
    "paid_at" timestamp with time zone,
    "coupon_id" "uuid",
    "assigned_to" "uuid",
    "cashier_id" "uuid",
    "server_id" "uuid",
    "display_currency" character varying(3) DEFAULT NULL::character varying,
    "tip_amount" bigint DEFAULT 0,
    "preparation_zone" "text" DEFAULT 'kitchen'::"text" NOT NULL,
    "orange_money_pay_token" "text",
    "orange_money_notif_token" "text",
    "wave_checkout_id" "text",
    "payment_initiated_at" timestamp with time zone,
    "table_id" "uuid",
    "client_request_id" "uuid",
    "session_id" "uuid",
    "served_at" timestamp with time zone,
    "is_comp" boolean DEFAULT false NOT NULL,
    "comp_reason" "text",
    "comped_by" "uuid",
    "comped_at" timestamp with time zone,
    "comp_amount" bigint,
    "house_account_id" "uuid",
    CONSTRAINT "orders_payment_method_check" CHECK ((("payment_method")::"text" = ANY ((ARRAY['cash'::character varying, 'card'::character varying, 'wave'::character varying, 'orange_money'::character varying, 'mtn_momo'::character varying, 'free_money'::character varying])::"text"[]))),
    CONSTRAINT "orders_payment_status_check" CHECK ((("payment_status")::"text" = ANY ((ARRAY['pending'::character varying, 'paid'::character varying, 'partial'::character varying, 'refunded'::character varying, 'comp'::character varying])::"text"[]))),
    CONSTRAINT "orders_preparation_zone_check" CHECK (("preparation_zone" = ANY (ARRAY['kitchen'::"text", 'bar'::"text", 'mixed'::"text"]))),
    CONSTRAINT "orders_service_type_check" CHECK ((("service_type")::"text" = ANY ((ARRAY['dine_in'::character varying, 'takeaway'::character varying, 'delivery'::character varying, 'room_service'::character varying])::"text"[]))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'preparing'::"text", 'ready'::"text", 'delivered'::"text", 'served'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";

--
-- Name: COLUMN "orders"."tip_amount"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."orders"."tip_amount" IS 'Tip/pourboire amount in base currency (XAF)';


--
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."payments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "amount" bigint NOT NULL,
    "method" "text" NOT NULL,
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "client_request_id" "uuid",
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['completed'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";

--
-- Name: COLUMN "payments"."client_request_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."payments"."client_request_id" IS 'Cle d''idempotence frappee par le client au moment du geste d''encaissement. Un rejeu porte la meme valeur et est refuse par l''index unique (F5).';


--
-- Name: platform_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."platform_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_user_id" "uuid",
    "actor_email" "text",
    "action" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid",
    "target_label" "text",
    "tenant_id" "uuid",
    "reason" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."platform_audit_log" OWNER TO "postgres";

--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";

--
-- Name: qr_designs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."qr_designs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "config" "jsonb" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."qr_designs" OWNER TO "postgres";

--
-- Name: recipes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "quantity_needed" numeric(10,3) NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "recipes_quantity_needed_check" CHECK (("quantity_needed" > (0)::numeric))
);


ALTER TABLE "public"."recipes" OWNER TO "postgres";

--
-- Name: restaurant_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."restaurant_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'Mon Groupe'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."restaurant_groups" OWNER TO "postgres";

--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."role_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "permissions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "role_permissions_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'manager'::"text", 'cashier'::"text", 'chef'::"text", 'waiter'::"text"])))
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";

--
-- Name: settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."settings" OWNER TO "postgres";

--
-- Name: stock_alert_notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."stock_alert_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "alert_type" "text" NOT NULL,
    "sent_to" "text"[] NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stock_alert_notifications_alert_type_check" CHECK (("alert_type" = ANY (ARRAY['low_stock'::"text", 'out_of_stock'::"text"])))
);


ALTER TABLE "public"."stock_alert_notifications" OWNER TO "postgres";

--
-- Name: stock_count_lines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."stock_count_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "count_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "theoretical_qty" numeric(10,3) DEFAULT 0 NOT NULL,
    "counted_qty" numeric(10,3),
    "variance" numeric(10,3) GENERATED ALWAYS AS (("counted_qty" - "theoretical_qty")) STORED,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stock_count_lines" OWNER TO "postgres";

--
-- Name: stock_counts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."stock_counts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "reference" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_by" "uuid",
    "committed_by" "uuid",
    "committed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stock_counts_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'committed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."stock_counts" OWNER TO "postgres";

--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."stock_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "movement_type" "text" NOT NULL,
    "quantity" numeric(10,3) NOT NULL,
    "reference_id" "uuid",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "supplier_id" "uuid",
    "reason_code" "text",
    CONSTRAINT "stock_movements_movement_type_check" CHECK (("movement_type" = ANY (ARRAY['order_destock'::"text", 'order_restock'::"text", 'manual_add'::"text", 'manual_remove'::"text", 'adjustment'::"text", 'opening'::"text", 'physical_count'::"text", 'loss'::"text", 'transfer_in'::"text", 'transfer_out'::"text"]))),
    CONSTRAINT "stock_movements_reason_code_check" CHECK ((("reason_code" IS NULL) OR ("reason_code" = ANY (ARRAY['expired'::"text", 'breakage'::"text", 'theft'::"text", 'spillage'::"text", 'prep_waste'::"text", 'recount'::"text", 'reconcile'::"text", 'other'::"text"]))))
);


ALTER TABLE "public"."stock_movements" OWNER TO "postgres";

--
-- Name: stripe_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."stripe_events" (
    "id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "stripe_created_at" timestamp with time zone,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stripe_events" OWNER TO "postgres";

--
-- Name: TABLE "stripe_events"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."stripe_events" IS 'Idempotency log for Stripe webhook events. INSERT ON CONFLICT is used
     at the start of every webhook handler to detect replayed events.';


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "contact_name" "text",
    "phone" character varying(50),
    "email" "text",
    "address" "text",
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";

--
-- Name: table_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."table_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "table_id" "uuid" NOT NULL,
    "server_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."table_assignments" OWNER TO "postgres";

--
-- Name: table_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."table_sessions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "table_number" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    CONSTRAINT "table_sessions_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."table_sessions" OWNER TO "postgres";

--
-- Name: tables; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."tables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "zone_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "table_number" character varying(20) NOT NULL,
    "display_name" character varying(100) NOT NULL,
    "capacity" integer DEFAULT 2 NOT NULL,
    "is_active" boolean DEFAULT true,
    "qr_code_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "qr_design_id" "uuid",
    CONSTRAINT "tables_capacity_check" CHECK (("capacity" > 0))
);


ALTER TABLE "public"."tables" OWNER TO "postgres";

--
-- Name: tenant_supports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."tenant_supports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "type" "text" DEFAULT 'chevalet_standard'::"text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenant_supports_type_check" CHECK (("type" = 'chevalet_standard'::"text"))
);


ALTER TABLE "public"."tenant_supports" OWNER TO "postgres";

--
-- Name: tenants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."tenants" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "subscription_plan" "text" DEFAULT 'starter'::"text" NOT NULL,
    "subscription_status" "text" DEFAULT 'trial'::"text" NOT NULL,
    "subscription_current_period_start" timestamp with time zone,
    "subscription_current_period_end" timestamp with time zone,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "max_admins" integer DEFAULT 2 NOT NULL,
    "max_venues" integer DEFAULT 1 NOT NULL,
    "max_menu_items" integer DEFAULT 100 NOT NULL,
    "logo_url" "text",
    "primary_color" "text" DEFAULT '#C5A065'::"text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "onboarding_completed" boolean DEFAULT false,
    "onboarding_completed_at" timestamp with time zone,
    "trial_ends_at" timestamp with time zone,
    "billing_interval" "text" DEFAULT 'monthly'::"text",
    "secondary_color" "text" DEFAULT '#000000'::"text",
    "description" "text",
    "establishment_type" "text" DEFAULT 'restaurant'::"text",
    "address" "text",
    "city" "text",
    "country" "text" DEFAULT 'Cameroun'::"text",
    "phone" "text",
    "table_count" integer DEFAULT 10,
    "notification_sound_id" character varying(50) DEFAULT 'classic-bell'::character varying,
    "currency" character varying(3) DEFAULT 'XAF'::character varying,
    "tax_rate" numeric(5,2) DEFAULT 0,
    "service_charge_rate" numeric(5,2) DEFAULT 0,
    "enable_tax" boolean DEFAULT false,
    "enable_service_charge" boolean DEFAULT false,
    "idle_timeout_minutes" integer DEFAULT 30,
    "screen_lock_mode" "text" DEFAULT 'overlay'::"text",
    "default_locale" "text" DEFAULT 'fr-FR'::"text",
    "supported_currencies" "text"[] DEFAULT '{XAF}'::"text"[] NOT NULL,
    "enable_coupons" boolean DEFAULT false,
    "bar_display_enabled" boolean DEFAULT false NOT NULL,
    "opening_hours" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "enabled_payment_methods" "text"[] DEFAULT ARRAY['cash'::"text", 'card'::"text"] NOT NULL,
    "activation_events" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_active_at" timestamp with time zone,
    "at_food_enabled" boolean DEFAULT true,
    "group_id" "uuid",
    "custom_domain" character varying(255),
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "suspended_at" timestamp with time zone,
    "suspended_by" "uuid",
    "suspend_reason" "text",
    "banner_url" "text",
    "past_due_since" timestamp with time zone,
    "freeze_reason" "text",
    CONSTRAINT "tenants_billing_interval_check" CHECK (("billing_interval" = ANY (ARRAY['monthly'::"text", 'semiannual'::"text", 'yearly'::"text"]))),
    CONSTRAINT "tenants_currency_check" CHECK ((("currency")::"text" = ANY ((ARRAY['XAF'::character varying, 'XOF'::character varying, 'EUR'::character varying, 'USD'::character varying])::"text"[]))),
    CONSTRAINT "tenants_screen_lock_mode_check" CHECK (("screen_lock_mode" = ANY (ARRAY['overlay'::"text", 'password'::"text"]))),
    CONSTRAINT "tenants_service_charge_rate_check" CHECK ((("service_charge_rate" >= (0)::numeric) AND ("service_charge_rate" <= (100)::numeric))),
    CONSTRAINT "tenants_subscription_status_check" CHECK (("subscription_status" = ANY (ARRAY['trial'::"text", 'active'::"text", 'past_due'::"text", 'cancelled'::"text", 'paused'::"text", 'frozen'::"text"]))),
    CONSTRAINT "tenants_tax_rate_check" CHECK ((("tax_rate" >= (0)::numeric) AND ("tax_rate" <= (100)::numeric)))
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";

--
-- Name: COLUMN "tenants"."idle_timeout_minutes"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."tenants"."idle_timeout_minutes" IS 'Minutes of inactivity before lock screen. NULL = disabled. Range: 5-120.';


--
-- Name: COLUMN "tenants"."screen_lock_mode"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."tenants"."screen_lock_mode" IS 'overlay = simple click-to-unlock, password = requires re-authentication';


--
-- Name: COLUMN "tenants"."default_locale"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."tenants"."default_locale" IS 'Default locale for the tenant dashboard and client-facing pages. One of: fr-FR, fr-CA, en-US, en-GB, en-AU, en-CA, en-IE, es-ES.';


--
-- Name: COLUMN "tenants"."opening_hours"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."tenants"."opening_hours" IS 'Weekly opening hours as { mon: {open,close}, ... }. Empty object = always open.';


--
-- Name: COLUMN "tenants"."past_due_since"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."tenants"."past_due_since" IS 'Instant de la premiere transition vers past_due. NULL des que le statut redevient sain. Lu par le cron de gel pour borner l''impaye dans le temps (F3).';


--
-- Name: COLUMN "tenants"."freeze_reason"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."tenants"."freeze_reason" IS 'Cause du gel: dispute, subscription_deleted, stripe_unpaid, trial_expired, past_due_overdue. Non nulle SI ET SEULEMENT SI subscription_status = ''frozen''. Lue par charge.dispute.closed, qui ne leve que le gel dont la cause est un litige. service_role uniquement.';


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."user_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "notification_sound" "text" DEFAULT 'default'::"text",
    "default_view" "text" DEFAULT 'standard'::"text",
    "language" "text" DEFAULT 'fr'::"text",
    "theme" "text" DEFAULT 'light'::"text",
    "kitchen_config" "jsonb" DEFAULT '{}'::"jsonb",
    "pos_config" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_preferences_default_view_check" CHECK (("default_view" = ANY (ARRAY['standard'::"text", 'pos'::"text", 'kitchen'::"text", 'server'::"text"]))),
    CONSTRAINT "user_preferences_language_check" CHECK (("language" = ANY (ARRAY['fr'::"text", 'en'::"text"]))),
    CONSTRAINT "user_preferences_theme_check" CHECK (("theme" = ANY (ARRAY['light'::"text", 'dark'::"text"])))
);


ALTER TABLE "public"."user_preferences" OWNER TO "postgres";

--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."user_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "login_at" timestamp with time zone DEFAULT "now"(),
    "logout_at" timestamp with time zone,
    "ip_address" "text",
    "user_agent" "text",
    "device_info" "jsonb" DEFAULT '{}'::"jsonb",
    "login_type" "text" DEFAULT 'web'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_sessions" OWNER TO "postgres";

--
-- Name: venues; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."venues" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "name_en" "text",
    "type" "text" DEFAULT 'restaurant'::"text" NOT NULL,
    "has_own_menu" boolean DEFAULT true NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."venues" OWNER TO "postgres";

--
-- Name: wave_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."wave_events" (
    "id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "wave_created_at" timestamp with time zone,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wave_events" OWNER TO "postgres";

--
-- Name: TABLE "wave_events"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."wave_events" IS 'Idempotency log for Wave webhook events. INSERT ON CONFLICT detects replays.';


--
-- Name: zones; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."zones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "venue_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "name_en" "text",
    "prefix" character varying(10) NOT NULL,
    "description" "text",
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "qr_design_id" "uuid"
);


ALTER TABLE "public"."zones" OWNER TO "postgres";

--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id");


--
-- Name: ads ads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ads"
    ADD CONSTRAINT "ads_pkey" PRIMARY KEY ("id");


--
-- Name: ai_credits_ledger ai_credits_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_credits_ledger"
    ADD CONSTRAINT "ai_credits_ledger_pkey" PRIMARY KEY ("id");


--
-- Name: ai_photo_credits ai_photo_credits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_photo_credits"
    ADD CONSTRAINT "ai_photo_credits_pkey" PRIMARY KEY ("tenant_id");


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");


--
-- Name: coupon_redemptions coupon_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."coupon_redemptions"
    ADD CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id");


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_pkey" PRIMARY KEY ("id");


--
-- Name: coupons coupons_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_tenant_id_code_key" UNIQUE ("tenant_id", "code");


--
-- Name: dish_photo_drafts dish_photo_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."dish_photo_drafts"
    ADD CONSTRAINT "dish_photo_drafts_pkey" PRIMARY KEY ("id");


--
-- Name: house_accounts house_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."house_accounts"
    ADD CONSTRAINT "house_accounts_pkey" PRIMARY KEY ("id");


--
-- Name: ingredients ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id");


--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");


--
-- Name: invitations invitations_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_token_key" UNIQUE ("token");


--
-- Name: item_modifiers item_modifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_modifiers"
    ADD CONSTRAINT "item_modifiers_pkey" PRIMARY KEY ("id");


--
-- Name: item_options item_options_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_options"
    ADD CONSTRAINT "item_options_pkey" PRIMARY KEY ("id");


--
-- Name: item_price_variants item_price_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_price_variants"
    ADD CONSTRAINT "item_price_variants_pkey" PRIMARY KEY ("id");


--
-- Name: item_suggestions item_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_suggestions"
    ADD CONSTRAINT "item_suggestions_pkey" PRIMARY KEY ("id");


--
-- Name: menu_items menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id");


--
-- Name: menus menus_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_pkey" PRIMARY KEY ("id");


--
-- Name: menus menus_tenant_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_tenant_id_slug_key" UNIQUE ("tenant_id", "slug");


--
-- Name: newsletter_subscriber newsletter_subscriber_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."newsletter_subscriber"
    ADD CONSTRAINT "newsletter_subscriber_email_key" UNIQUE ("email");


--
-- Name: newsletter_subscriber newsletter_subscriber_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."newsletter_subscriber"
    ADD CONSTRAINT "newsletter_subscriber_pkey" PRIMARY KEY ("id");


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");


--
-- Name: onboarding_progress onboarding_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."onboarding_progress"
    ADD CONSTRAINT "onboarding_progress_pkey" PRIMARY KEY ("tenant_id");


--
-- Name: orange_money_events orange_money_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orange_money_events"
    ADD CONSTRAINT "orange_money_events_pkey" PRIMARY KEY ("id");


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");


--
-- Name: order_mutation_requests order_mutation_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_mutation_requests"
    ADD CONSTRAINT "order_mutation_requests_pkey" PRIMARY KEY ("client_request_id");


--
-- Name: order_notes order_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_notes"
    ADD CONSTRAINT "order_notes_pkey" PRIMARY KEY ("id");


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");


--
-- Name: platform_audit_log platform_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."platform_audit_log"
    ADD CONSTRAINT "platform_audit_log_pkey" PRIMARY KEY ("id");


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");


--
-- Name: push_subscriptions push_subscriptions_user_id_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");


--
-- Name: qr_designs qr_designs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."qr_designs"
    ADD CONSTRAINT "qr_designs_pkey" PRIMARY KEY ("id");


--
-- Name: recipes recipes_menu_item_id_ingredient_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_menu_item_id_ingredient_id_key" UNIQUE ("menu_item_id", "ingredient_id");


--
-- Name: recipes recipes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_pkey" PRIMARY KEY ("id");


--
-- Name: restaurant_groups restaurant_groups_owner_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."restaurant_groups"
    ADD CONSTRAINT "restaurant_groups_owner_unique" UNIQUE ("owner_user_id");


--
-- Name: restaurant_groups restaurant_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."restaurant_groups"
    ADD CONSTRAINT "restaurant_groups_pkey" PRIMARY KEY ("id");


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id");


--
-- Name: role_permissions role_permissions_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_unique" UNIQUE ("tenant_id", "role");


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("id");


--
-- Name: stock_alert_notifications stock_alert_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_alert_notifications"
    ADD CONSTRAINT "stock_alert_notifications_pkey" PRIMARY KEY ("id");


--
-- Name: stock_count_lines stock_count_lines_count_id_ingredient_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_count_lines"
    ADD CONSTRAINT "stock_count_lines_count_id_ingredient_id_key" UNIQUE ("count_id", "ingredient_id");


--
-- Name: stock_count_lines stock_count_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_count_lines"
    ADD CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id");


--
-- Name: stock_counts stock_counts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_counts"
    ADD CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id");


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id");


--
-- Name: stripe_events stripe_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stripe_events"
    ADD CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id");


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");


--
-- Name: table_assignments table_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."table_assignments"
    ADD CONSTRAINT "table_assignments_pkey" PRIMARY KEY ("id");


--
-- Name: table_sessions table_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."table_sessions"
    ADD CONSTRAINT "table_sessions_pkey" PRIMARY KEY ("id");


--
-- Name: tables tables_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_pkey" PRIMARY KEY ("id");


--
-- Name: tenant_supports tenant_supports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenant_supports"
    ADD CONSTRAINT "tenant_supports_pkey" PRIMARY KEY ("id");


--
-- Name: tenant_supports tenant_supports_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenant_supports"
    ADD CONSTRAINT "tenant_supports_unique" UNIQUE ("tenant_id", "type");


--
-- Name: tenants tenants_custom_domain_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_custom_domain_key" UNIQUE ("custom_domain");


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");


--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_slug_key" UNIQUE ("slug");


--
-- Name: tenants tenants_stripe_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_stripe_customer_id_key" UNIQUE ("stripe_customer_id");


--
-- Name: tenants tenants_stripe_subscription_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id");


--
-- Name: user_preferences user_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_key" UNIQUE ("user_id");


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id");


--
-- Name: venues venues_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."venues"
    ADD CONSTRAINT "venues_pkey" PRIMARY KEY ("id");


--
-- Name: wave_events wave_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."wave_events"
    ADD CONSTRAINT "wave_events_pkey" PRIMARY KEY ("id");


--
-- Name: zones zones_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."zones"
    ADD CONSTRAINT "zones_pkey" PRIMARY KEY ("id");


--
-- Name: idx_admin_users_banned_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_admin_users_banned_by" ON "public"."admin_users" USING "btree" ("banned_by");


--
-- Name: idx_admin_users_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_admin_users_created_by" ON "public"."admin_users" USING "btree" ("created_by");


--
-- Name: idx_admin_users_deleted_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_admin_users_deleted_by" ON "public"."admin_users" USING "btree" ("deleted_by");


--
-- Name: idx_admin_users_email_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_admin_users_email_tenant" ON "public"."admin_users" USING "btree" ("tenant_id", "email");


--
-- Name: idx_admin_users_live; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_admin_users_live" ON "public"."admin_users" USING "btree" ("tenant_id") WHERE ("deleted_at" IS NULL);


--
-- Name: idx_admin_users_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_admin_users_tenant" ON "public"."admin_users" USING "btree" ("tenant_id");


--
-- Name: idx_admin_users_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_admin_users_user_id" ON "public"."admin_users" USING "btree" ("user_id");


--
-- Name: idx_ads_tenant_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ads_tenant_active" ON "public"."ads" USING "btree" ("tenant_id", "is_active") WHERE ("is_active" = true);


--
-- Name: idx_ads_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ads_tenant_id" ON "public"."ads" USING "btree" ("tenant_id");


--
-- Name: idx_ai_credits_ledger_menu_item_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ai_credits_ledger_menu_item_id" ON "public"."ai_credits_ledger" USING "btree" ("menu_item_id");


--
-- Name: idx_ai_credits_ledger_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ai_credits_ledger_tenant_id" ON "public"."ai_credits_ledger" USING "btree" ("tenant_id");


--
-- Name: idx_ai_credits_ledger_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ai_credits_ledger_user_id" ON "public"."ai_credits_ledger" USING "btree" ("user_id");


--
-- Name: idx_announcements_tenant_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_announcements_tenant_active" ON "public"."announcements" USING "btree" ("tenant_id", "is_active") WHERE ("is_active" = true);


--
-- Name: idx_announcements_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_announcements_tenant_id" ON "public"."announcements" USING "btree" ("tenant_id");


--
-- Name: idx_audit_log_entity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_audit_log_entity" ON "public"."audit_log" USING "btree" ("entity_type", "entity_id");


--
-- Name: idx_audit_log_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_audit_log_tenant" ON "public"."audit_log" USING "btree" ("tenant_id", "created_at" DESC);


--
-- Name: idx_audit_log_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_audit_log_user" ON "public"."audit_log" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_categories_featured_on_home; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_categories_featured_on_home" ON "public"."categories" USING "btree" ("tenant_id") WHERE ("is_featured_on_home" = true);


--
-- Name: idx_categories_menu; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_categories_menu" ON "public"."categories" USING "btree" ("menu_id");


--
-- Name: idx_categories_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_categories_tenant" ON "public"."categories" USING "btree" ("tenant_id");


--
-- Name: idx_categories_venue; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_categories_venue" ON "public"."categories" USING "btree" ("venue_id");


--
-- Name: idx_coupon_redemptions_coupon_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_coupon_redemptions_coupon_id" ON "public"."coupon_redemptions" USING "btree" ("coupon_id");


--
-- Name: idx_coupon_redemptions_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_coupon_redemptions_order" ON "public"."coupon_redemptions" USING "btree" ("order_id");


--
-- Name: idx_coupon_redemptions_tenant_coupon; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_coupon_redemptions_tenant_coupon" ON "public"."coupon_redemptions" USING "btree" ("tenant_id", "coupon_id");


--
-- Name: idx_coupons_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_coupons_code" ON "public"."coupons" USING "btree" ("code") WHERE ("is_active" = true);


--
-- Name: idx_coupons_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_coupons_tenant" ON "public"."coupons" USING "btree" ("tenant_id");


--
-- Name: idx_coupons_validation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_coupons_validation" ON "public"."coupons" USING "btree" ("tenant_id", "code", "is_active") WHERE ("is_active" = true);


--
-- Name: idx_dish_photo_drafts_attached_menu_item_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_dish_photo_drafts_attached_menu_item_id" ON "public"."dish_photo_drafts" USING "btree" ("attached_menu_item_id");


--
-- Name: idx_dish_photo_drafts_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_dish_photo_drafts_created_by" ON "public"."dish_photo_drafts" USING "btree" ("created_by");


--
-- Name: idx_dish_photo_drafts_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_dish_photo_drafts_tenant" ON "public"."dish_photo_drafts" USING "btree" ("tenant_id", "status");


--
-- Name: idx_house_accounts_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_house_accounts_tenant" ON "public"."house_accounts" USING "btree" ("tenant_id");


--
-- Name: idx_house_accounts_tenant_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_house_accounts_tenant_status" ON "public"."house_accounts" USING "btree" ("tenant_id", "status");


--
-- Name: idx_ingredients_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ingredients_active" ON "public"."ingredients" USING "btree" ("tenant_id", "is_active");


--
-- Name: idx_ingredients_stock_alert; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ingredients_stock_alert" ON "public"."ingredients" USING "btree" ("tenant_id", "is_active", "current_stock", "min_stock_alert") WHERE ("is_active" = true);


--
-- Name: idx_ingredients_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ingredients_tenant" ON "public"."ingredients" USING "btree" ("tenant_id");


--
-- Name: idx_ingredients_tenant_lower_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ingredients_tenant_lower_name" ON "public"."ingredients" USING "btree" ("tenant_id", "lower"("name"));


--
-- Name: idx_invitations_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invitations_email" ON "public"."invitations" USING "btree" ("email");


--
-- Name: idx_invitations_invited_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invitations_invited_by" ON "public"."invitations" USING "btree" ("invited_by");


--
-- Name: idx_invitations_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invitations_tenant" ON "public"."invitations" USING "btree" ("tenant_id");


--
-- Name: idx_invitations_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invitations_token" ON "public"."invitations" USING "btree" ("token");


--
-- Name: idx_ipv_menu_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ipv_menu_item" ON "public"."item_price_variants" USING "btree" ("menu_item_id");


--
-- Name: idx_ipv_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ipv_tenant" ON "public"."item_price_variants" USING "btree" ("tenant_id");


--
-- Name: idx_item_modifiers_menu_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_item_modifiers_menu_item" ON "public"."item_modifiers" USING "btree" ("menu_item_id");


--
-- Name: idx_item_modifiers_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_item_modifiers_tenant" ON "public"."item_modifiers" USING "btree" ("tenant_id");


--
-- Name: idx_item_options_menu_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_item_options_menu_item" ON "public"."item_options" USING "btree" ("menu_item_id");


--
-- Name: idx_item_options_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_item_options_tenant" ON "public"."item_options" USING "btree" ("tenant_id");


--
-- Name: idx_item_suggestions_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_item_suggestions_item" ON "public"."item_suggestions" USING "btree" ("menu_item_id");


--
-- Name: idx_item_suggestions_suggested_item_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_item_suggestions_suggested_item_id" ON "public"."item_suggestions" USING "btree" ("suggested_item_id");


--
-- Name: idx_item_suggestions_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_item_suggestions_tenant" ON "public"."item_suggestions" USING "btree" ("tenant_id");


--
-- Name: idx_menu_items_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_menu_items_active" ON "public"."menu_items" USING "btree" ("tenant_id", "category_id") WHERE ("deleted_at" IS NULL);


--
-- Name: idx_menu_items_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_menu_items_category" ON "public"."menu_items" USING "btree" ("category_id");


--
-- Name: idx_menu_items_image_uploaded_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_menu_items_image_uploaded_by" ON "public"."menu_items" USING "btree" ("image_uploaded_by");


--
-- Name: idx_menu_items_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_menu_items_tenant" ON "public"."menu_items" USING "btree" ("tenant_id");


--
-- Name: idx_menu_items_tenant_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_menu_items_tenant_category" ON "public"."menu_items" USING "btree" ("tenant_id", "category_id");


--
-- Name: idx_menus_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_menus_active" ON "public"."menus" USING "btree" ("tenant_id", "is_active") WHERE ("is_active" = true);


--
-- Name: idx_menus_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_menus_parent" ON "public"."menus" USING "btree" ("parent_menu_id");


--
-- Name: idx_menus_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_menus_slug" ON "public"."menus" USING "btree" ("tenant_id", "slug");


--
-- Name: idx_menus_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_menus_tenant" ON "public"."menus" USING "btree" ("tenant_id");


--
-- Name: idx_menus_transversal; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_menus_transversal" ON "public"."menus" USING "btree" ("tenant_id") WHERE ("is_transversal_menu" = true);


--
-- Name: idx_menus_venue; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_menus_venue" ON "public"."menus" USING "btree" ("venue_id");


--
-- Name: idx_notifications_tenant_broadcast; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_notifications_tenant_broadcast" ON "public"."notifications" USING "btree" ("tenant_id", "created_at" DESC) WHERE ("user_id" IS NULL);


--
-- Name: idx_notifications_tenant_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_notifications_tenant_user" ON "public"."notifications" USING "btree" ("tenant_id", "user_id", "read", "created_at" DESC);


--
-- Name: idx_onboarding_progress_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_onboarding_progress_tenant" ON "public"."onboarding_progress" USING "btree" ("tenant_id");


--
-- Name: idx_order_items_course; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_items_course" ON "public"."order_items" USING "btree" ("order_id", "course");


--
-- Name: idx_order_items_menu_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_items_menu_item" ON "public"."order_items" USING "btree" ("menu_item_id");


--
-- Name: idx_order_items_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_items_order" ON "public"."order_items" USING "btree" ("order_id");


--
-- Name: idx_order_items_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_items_status" ON "public"."order_items" USING "btree" ("order_id", "item_status");


--
-- Name: idx_order_items_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_items_tenant_id" ON "public"."order_items" USING "btree" ("tenant_id");


--
-- Name: idx_order_mutation_requests_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_mutation_requests_tenant" ON "public"."order_mutation_requests" USING "btree" ("tenant_id");


--
-- Name: idx_order_notes_tenant_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_notes_tenant_order" ON "public"."order_notes" USING "btree" ("tenant_id", "order_id");


--
-- Name: idx_orders_assigned; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_assigned" ON "public"."orders" USING "btree" ("assigned_to");


--
-- Name: idx_orders_cashier; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_cashier" ON "public"."orders" USING "btree" ("cashier_id");


--
-- Name: idx_orders_coupon_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_coupon_id" ON "public"."orders" USING "btree" ("coupon_id") WHERE ("coupon_id" IS NOT NULL);


--
-- Name: idx_orders_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_created_at" ON "public"."orders" USING "btree" ("created_at" DESC);


--
-- Name: idx_orders_house_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_house_account" ON "public"."orders" USING "btree" ("tenant_id", "house_account_id") WHERE ("house_account_id" IS NOT NULL);


--
-- Name: idx_orders_number_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_orders_number_tenant" ON "public"."orders" USING "btree" ("tenant_id", "order_number");


--
-- Name: idx_orders_orange_pay_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_orange_pay_token" ON "public"."orders" USING "btree" ("orange_money_pay_token") WHERE ("orange_money_pay_token" IS NOT NULL);


--
-- Name: idx_orders_payment_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_payment_status" ON "public"."orders" USING "btree" ("tenant_id", "payment_status");


--
-- Name: idx_orders_server; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_server" ON "public"."orders" USING "btree" ("server_id");


--
-- Name: idx_orders_service_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_service_type" ON "public"."orders" USING "btree" ("tenant_id", "service_type");


--
-- Name: idx_orders_session; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_session" ON "public"."orders" USING "btree" ("session_id");


--
-- Name: idx_orders_stale_payment_sessions; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_stale_payment_sessions" ON "public"."orders" USING "btree" ("payment_initiated_at") WHERE ((("payment_status")::"text" = 'pending'::"text") AND ("payment_initiated_at" IS NOT NULL) AND (("wave_checkout_id" IS NOT NULL) OR ("orange_money_pay_token" IS NOT NULL)));


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");


--
-- Name: idx_orders_table_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_table_id" ON "public"."orders" USING "btree" ("table_id") WHERE ("table_id" IS NOT NULL);


--
-- Name: idx_orders_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_tenant" ON "public"."orders" USING "btree" ("tenant_id");


--
-- Name: idx_orders_tenant_order_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_tenant_order_number" ON "public"."orders" USING "btree" ("tenant_id", "order_number" "text_pattern_ops");


--
-- Name: idx_orders_tenant_prep_zone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_tenant_prep_zone" ON "public"."orders" USING "btree" ("tenant_id", "preparation_zone", "status") WHERE ("status" = ANY (ARRAY['pending'::"text", 'preparing'::"text", 'ready'::"text"]));


--
-- Name: idx_orders_tenant_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_tenant_status" ON "public"."orders" USING "btree" ("tenant_id", "status");


--
-- Name: idx_orders_tenant_status_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_tenant_status_created" ON "public"."orders" USING "btree" ("tenant_id", "status", "created_at" DESC);


--
-- Name: idx_orders_venue; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_venue" ON "public"."orders" USING "btree" ("venue_id");


--
-- Name: idx_orders_venue_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_venue_status" ON "public"."orders" USING "btree" ("venue_id", "status", "created_at" DESC);


--
-- Name: idx_orders_wave_checkout_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_wave_checkout_id" ON "public"."orders" USING "btree" ("wave_checkout_id") WHERE ("wave_checkout_id" IS NOT NULL);


--
-- Name: idx_payments_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_payments_created_by" ON "public"."payments" USING "btree" ("created_by");


--
-- Name: idx_payments_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_payments_order" ON "public"."payments" USING "btree" ("order_id");


--
-- Name: idx_payments_tenant_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_payments_tenant_order" ON "public"."payments" USING "btree" ("tenant_id", "order_id");


--
-- Name: idx_platform_audit_log_actor_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_platform_audit_log_actor_user_id" ON "public"."platform_audit_log" USING "btree" ("actor_user_id");


--
-- Name: idx_platform_audit_log_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_platform_audit_log_created" ON "public"."platform_audit_log" USING "btree" ("created_at" DESC);


--
-- Name: idx_platform_audit_log_target; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_platform_audit_log_target" ON "public"."platform_audit_log" USING "btree" ("target_type", "target_id");


--
-- Name: idx_platform_audit_log_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_platform_audit_log_tenant_id" ON "public"."platform_audit_log" USING "btree" ("tenant_id");


--
-- Name: idx_push_subscriptions_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_push_subscriptions_tenant" ON "public"."push_subscriptions" USING "btree" ("tenant_id");


--
-- Name: idx_push_subscriptions_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_push_subscriptions_user" ON "public"."push_subscriptions" USING "btree" ("user_id");


--
-- Name: idx_qr_designs_one_default; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_qr_designs_one_default" ON "public"."qr_designs" USING "btree" ("tenant_id") WHERE ("is_default" = true);


--
-- Name: idx_qr_designs_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_qr_designs_tenant" ON "public"."qr_designs" USING "btree" ("tenant_id");


--
-- Name: idx_recipes_ingredient; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_recipes_ingredient" ON "public"."recipes" USING "btree" ("ingredient_id");


--
-- Name: idx_recipes_menu_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_recipes_menu_item" ON "public"."recipes" USING "btree" ("menu_item_id");


--
-- Name: idx_recipes_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_recipes_tenant" ON "public"."recipes" USING "btree" ("tenant_id");


--
-- Name: idx_restaurant_groups_owner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_restaurant_groups_owner" ON "public"."restaurant_groups" USING "btree" ("owner_user_id");


--
-- Name: idx_role_permissions_updated_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_role_permissions_updated_by" ON "public"."role_permissions" USING "btree" ("updated_by");


--
-- Name: idx_settings_key_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_settings_key_tenant" ON "public"."settings" USING "btree" ("tenant_id", "key");


--
-- Name: idx_stock_alert_notifications_ingredient_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_alert_notifications_ingredient_id" ON "public"."stock_alert_notifications" USING "btree" ("ingredient_id");


--
-- Name: idx_stock_alerts_rate_limit; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_alerts_rate_limit" ON "public"."stock_alert_notifications" USING "btree" ("tenant_id", "ingredient_id", "sent_at" DESC);


--
-- Name: idx_stock_count_lines_count; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_count_lines_count" ON "public"."stock_count_lines" USING "btree" ("count_id");


--
-- Name: idx_stock_count_lines_ingredient; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_count_lines_ingredient" ON "public"."stock_count_lines" USING "btree" ("ingredient_id");


--
-- Name: idx_stock_count_lines_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_count_lines_tenant" ON "public"."stock_count_lines" USING "btree" ("tenant_id");


--
-- Name: idx_stock_counts_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_counts_tenant" ON "public"."stock_counts" USING "btree" ("tenant_id");


--
-- Name: idx_stock_counts_tenant_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_counts_tenant_status" ON "public"."stock_counts" USING "btree" ("tenant_id", "status");


--
-- Name: idx_stock_movements_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_movements_created_by" ON "public"."stock_movements" USING "btree" ("tenant_id", "created_by") WHERE ("created_by" IS NOT NULL);


--
-- Name: idx_stock_movements_ingredient; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_movements_ingredient" ON "public"."stock_movements" USING "btree" ("ingredient_id");


--
-- Name: idx_stock_movements_supplier; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_movements_supplier" ON "public"."stock_movements" USING "btree" ("supplier_id") WHERE ("supplier_id" IS NOT NULL);


--
-- Name: idx_stock_movements_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_movements_tenant" ON "public"."stock_movements" USING "btree" ("tenant_id");


--
-- Name: idx_stock_movements_tenant_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_movements_tenant_created" ON "public"."stock_movements" USING "btree" ("tenant_id", "created_at" DESC);


--
-- Name: idx_stock_movements_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stock_movements_type" ON "public"."stock_movements" USING "btree" ("tenant_id", "movement_type");


--
-- Name: idx_suppliers_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_suppliers_active" ON "public"."suppliers" USING "btree" ("tenant_id", "is_active");


--
-- Name: idx_suppliers_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_suppliers_tenant" ON "public"."suppliers" USING "btree" ("tenant_id");


--
-- Name: idx_table_assignments_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_table_assignments_active" ON "public"."table_assignments" USING "btree" ("tenant_id", "table_id") WHERE ("ended_at" IS NULL);


--
-- Name: idx_table_assignments_server; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_table_assignments_server" ON "public"."table_assignments" USING "btree" ("server_id") WHERE ("ended_at" IS NULL);


--
-- Name: idx_table_assignments_table_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_table_assignments_table_id" ON "public"."table_assignments" USING "btree" ("table_id");


--
-- Name: idx_table_assignments_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_table_assignments_tenant" ON "public"."table_assignments" USING "btree" ("tenant_id");


--
-- Name: idx_table_sessions_tenant_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_table_sessions_tenant_status" ON "public"."table_sessions" USING "btree" ("tenant_id", "status");


--
-- Name: idx_tables_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tables_active" ON "public"."tables" USING "btree" ("tenant_id", "is_active") WHERE ("is_active" = true);


--
-- Name: idx_tables_qr_design; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tables_qr_design" ON "public"."tables" USING "btree" ("qr_design_id");


--
-- Name: idx_tables_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tables_tenant" ON "public"."tables" USING "btree" ("tenant_id");


--
-- Name: idx_tables_zone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tables_zone" ON "public"."tables" USING "btree" ("zone_id");


--
-- Name: idx_tenants_custom_domain; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_custom_domain" ON "public"."tenants" USING "btree" ("custom_domain") WHERE ("custom_domain" IS NOT NULL);


--
-- Name: idx_tenants_deleted_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_deleted_by" ON "public"."tenants" USING "btree" ("deleted_by");


--
-- Name: idx_tenants_group_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_group_id" ON "public"."tenants" USING "btree" ("group_id");


--
-- Name: idx_tenants_live; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_live" ON "public"."tenants" USING "btree" ("slug") WHERE ("deleted_at" IS NULL);


--
-- Name: idx_tenants_name_ci; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_name_ci" ON "public"."tenants" USING "btree" ("lower"("btrim"("name"))) WHERE (("deleted_at" IS NULL) AND ("onboarding_completed" = true) AND ("group_id" IS NOT NULL));


--
-- Name: idx_tenants_onboarding; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_onboarding" ON "public"."tenants" USING "btree" ("onboarding_completed");


--
-- Name: idx_tenants_past_due_since; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_past_due_since" ON "public"."tenants" USING "btree" ("past_due_since") WHERE ("subscription_status" = 'past_due'::"text");


--
-- Name: idx_tenants_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_slug" ON "public"."tenants" USING "btree" ("slug");


--
-- Name: idx_tenants_stripe_customer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_stripe_customer_id" ON "public"."tenants" USING "btree" ("stripe_customer_id");


--
-- Name: idx_tenants_subscription_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_subscription_status" ON "public"."tenants" USING "btree" ("subscription_status");


--
-- Name: idx_tenants_suspended_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_suspended_by" ON "public"."tenants" USING "btree" ("suspended_by");


--
-- Name: idx_tenants_trial_ends_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tenants_trial_ends_at" ON "public"."tenants" USING "btree" ("trial_ends_at") WHERE ("subscription_status" = 'trial'::"text");


--
-- Name: idx_user_preferences_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_preferences_user" ON "public"."user_preferences" USING "btree" ("user_id");


--
-- Name: idx_user_sessions_login_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_sessions_login_at" ON "public"."user_sessions" USING "btree" ("login_at");


--
-- Name: idx_user_sessions_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_sessions_tenant" ON "public"."user_sessions" USING "btree" ("tenant_id");


--
-- Name: idx_user_sessions_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_sessions_user" ON "public"."user_sessions" USING "btree" ("user_id");


--
-- Name: idx_venues_slug_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_venues_slug_tenant" ON "public"."venues" USING "btree" ("tenant_id", "slug");


--
-- Name: idx_venues_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_venues_tenant" ON "public"."venues" USING "btree" ("tenant_id");


--
-- Name: idx_zones_qr_design; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_zones_qr_design" ON "public"."zones" USING "btree" ("qr_design_id");


--
-- Name: idx_zones_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_zones_tenant" ON "public"."zones" USING "btree" ("tenant_id");


--
-- Name: idx_zones_venue; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_zones_venue" ON "public"."zones" USING "btree" ("venue_id");


--
-- Name: orange_money_events_processed_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "orange_money_events_processed_at_idx" ON "public"."orange_money_events" USING "btree" ("processed_at" DESC);


--
-- Name: stripe_events_processed_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "stripe_events_processed_at_idx" ON "public"."stripe_events" USING "btree" ("processed_at" DESC);


--
-- Name: tenant_supports_tenant_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "tenant_supports_tenant_id_idx" ON "public"."tenant_supports" USING "btree" ("tenant_id");


--
-- Name: uniq_open_session_per_table; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "uniq_open_session_per_table" ON "public"."table_sessions" USING "btree" ("tenant_id", "table_number") WHERE ("status" = 'open'::"text");


--
-- Name: uniq_stock_counts_one_open; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "uniq_stock_counts_one_open" ON "public"."stock_counts" USING "btree" ("tenant_id") WHERE ("status" = 'open'::"text");


--
-- Name: uq_orders_tenant_client_request_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "uq_orders_tenant_client_request_id" ON "public"."orders" USING "btree" ("tenant_id", "client_request_id") WHERE ("client_request_id" IS NOT NULL);


--
-- Name: uq_payments_tenant_client_request_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "uq_payments_tenant_client_request_id" ON "public"."payments" USING "btree" ("tenant_id", "client_request_id") WHERE ("client_request_id" IS NOT NULL);


--
-- Name: venues_tenant_slug_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "venues_tenant_slug_uniq" ON "public"."venues" USING "btree" ("tenant_id", "slug");


--
-- Name: wave_events_processed_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "wave_events_processed_at_idx" ON "public"."wave_events" USING "btree" ("processed_at" DESC);


--
-- Name: admin_users prevent_super_admin_elevation_trg; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "prevent_super_admin_elevation_trg" BEFORE INSERT OR UPDATE ON "public"."admin_users" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_super_admin_elevation"();


--
-- Name: tenant_supports tenant_supports_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "tenant_supports_updated_at" BEFORE UPDATE ON "public"."tenant_supports" FOR EACH ROW EXECUTE FUNCTION "public"."update_tenant_supports_updated_at"();


--
-- Name: orders trg_broadcast_order_status; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_broadcast_order_status" AFTER UPDATE OF "status" ON "public"."orders" FOR EACH ROW WHEN (("old"."status" IS DISTINCT FROM "new"."status")) EXECUTE FUNCTION "public"."broadcast_order_status"();


--
-- Name: ingredients trg_enforce_inventory_entitlement; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_enforce_inventory_entitlement" BEFORE INSERT ON "public"."ingredients" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_inventory_entitlement"();


--
-- Name: stock_counts trg_enforce_inventory_entitlement; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_enforce_inventory_entitlement" BEFORE INSERT OR UPDATE ON "public"."stock_counts" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_inventory_entitlement"();


--
-- Name: suppliers trg_enforce_inventory_entitlement; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_enforce_inventory_entitlement" BEFORE INSERT OR UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_inventory_entitlement"();


--
-- Name: venues trg_enforce_min_one_active_venue; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_enforce_min_one_active_venue" AFTER UPDATE ON "public"."venues" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_min_one_active_venue"();


--
-- Name: qr_designs trg_enforce_qr_customization_entitlement; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_enforce_qr_customization_entitlement" BEFORE INSERT OR UPDATE ON "public"."qr_designs" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_qr_customization_entitlement"();


--
-- Name: venues trg_enforce_venue_plan_limit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_enforce_venue_plan_limit" AFTER INSERT OR UPDATE ON "public"."venues" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_venue_plan_limit"();


--
-- Name: order_items trg_order_items_tenant_id; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_order_items_tenant_id" BEFORE INSERT ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_order_item_tenant_id"();


--
-- Name: qr_designs trg_qr_designs_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_qr_designs_updated_at" BEFORE UPDATE ON "public"."qr_designs" FOR EACH ROW EXECUTE FUNCTION "public"."set_qr_designs_updated_at"();


--
-- Name: tenants trg_tenant_name_cross_group_unique; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_tenant_name_cross_group_unique" BEFORE INSERT OR UPDATE OF "name" ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_tenant_name_cross_group_unique"();


--
-- Name: admin_users trigger_auto_create_user_preferences; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trigger_auto_create_user_preferences" AFTER INSERT ON "public"."admin_users" FOR EACH ROW EXECUTE FUNCTION "public"."auto_create_user_preferences"();


--
-- Name: ingredients trigger_ingredients_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trigger_ingredients_updated_at" BEFORE UPDATE ON "public"."ingredients" FOR EACH ROW EXECUTE FUNCTION "public"."update_ingredients_updated_at"();


--
-- Name: menus trigger_menus_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trigger_menus_updated_at" BEFORE UPDATE ON "public"."menus" FOR EACH ROW EXECUTE FUNCTION "public"."update_menus_updated_at"();


--
-- Name: tenants trigger_set_trial_end_date; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trigger_set_trial_end_date" BEFORE INSERT OR UPDATE ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."set_trial_end_date"();


--
-- Name: stock_counts trigger_stock_counts_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trigger_stock_counts_updated_at" BEFORE UPDATE ON "public"."stock_counts" FOR EACH ROW EXECUTE FUNCTION "public"."update_ingredients_updated_at"();


--
-- Name: suppliers trigger_suppliers_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trigger_suppliers_updated_at" BEFORE UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."update_suppliers_updated_at"();


--
-- Name: user_preferences trigger_user_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trigger_user_preferences_updated_at" BEFORE UPDATE ON "public"."user_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_preferences_updated_at"();


--
-- Name: menu_items update_menu_items_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_menu_items_updated_at" BEFORE UPDATE ON "public"."menu_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: orders update_orders_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: tenants update_tenants_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_tenants_updated_at" BEFORE UPDATE ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: admin_users admin_users_banned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_banned_by_fkey" FOREIGN KEY ("banned_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: admin_users admin_users_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id");


--
-- Name: admin_users admin_users_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: admin_users admin_users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: admin_users admin_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: ads ads_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ads"
    ADD CONSTRAINT "ads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: ai_credits_ledger ai_credits_ledger_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_credits_ledger"
    ADD CONSTRAINT "ai_credits_ledger_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE SET NULL;


--
-- Name: ai_credits_ledger ai_credits_ledger_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_credits_ledger"
    ADD CONSTRAINT "ai_credits_ledger_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: ai_credits_ledger ai_credits_ledger_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_credits_ledger"
    ADD CONSTRAINT "ai_credits_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: ai_photo_credits ai_photo_credits_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_photo_credits"
    ADD CONSTRAINT "ai_photo_credits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: announcements announcements_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: audit_log audit_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: audit_log audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: categories categories_menu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE CASCADE;


--
-- Name: categories categories_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: categories categories_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE CASCADE;


--
-- Name: coupon_redemptions coupon_redemptions_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."coupon_redemptions"
    ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE SET NULL;


--
-- Name: coupon_redemptions coupon_redemptions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."coupon_redemptions"
    ADD CONSTRAINT "coupon_redemptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;


--
-- Name: coupon_redemptions coupon_redemptions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."coupon_redemptions"
    ADD CONSTRAINT "coupon_redemptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: coupons coupons_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: dish_photo_drafts dish_photo_drafts_attached_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."dish_photo_drafts"
    ADD CONSTRAINT "dish_photo_drafts_attached_menu_item_id_fkey" FOREIGN KEY ("attached_menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE SET NULL;


--
-- Name: dish_photo_drafts dish_photo_drafts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."dish_photo_drafts"
    ADD CONSTRAINT "dish_photo_drafts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: dish_photo_drafts dish_photo_drafts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."dish_photo_drafts"
    ADD CONSTRAINT "dish_photo_drafts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: house_accounts house_accounts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."house_accounts"
    ADD CONSTRAINT "house_accounts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL;


--
-- Name: house_accounts house_accounts_settled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."house_accounts"
    ADD CONSTRAINT "house_accounts_settled_by_fkey" FOREIGN KEY ("settled_by") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL;


--
-- Name: house_accounts house_accounts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."house_accounts"
    ADD CONSTRAINT "house_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: ingredients ingredients_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: invitations invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."admin_users"("id");


--
-- Name: invitations invitations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: item_modifiers item_modifiers_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_modifiers"
    ADD CONSTRAINT "item_modifiers_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;


--
-- Name: item_modifiers item_modifiers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_modifiers"
    ADD CONSTRAINT "item_modifiers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: item_options item_options_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_options"
    ADD CONSTRAINT "item_options_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;


--
-- Name: item_options item_options_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_options"
    ADD CONSTRAINT "item_options_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: item_price_variants item_price_variants_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_price_variants"
    ADD CONSTRAINT "item_price_variants_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;


--
-- Name: item_price_variants item_price_variants_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_price_variants"
    ADD CONSTRAINT "item_price_variants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: item_suggestions item_suggestions_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_suggestions"
    ADD CONSTRAINT "item_suggestions_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;


--
-- Name: item_suggestions item_suggestions_suggested_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_suggestions"
    ADD CONSTRAINT "item_suggestions_suggested_item_id_fkey" FOREIGN KEY ("suggested_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;


--
-- Name: item_suggestions item_suggestions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."item_suggestions"
    ADD CONSTRAINT "item_suggestions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: menu_items menu_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;


--
-- Name: menu_items menu_items_image_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_image_uploaded_by_fkey" FOREIGN KEY ("image_uploaded_by") REFERENCES "auth"."users"("id");


--
-- Name: menu_items menu_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: menus menus_parent_menu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_parent_menu_id_fkey" FOREIGN KEY ("parent_menu_id") REFERENCES "public"."menus"("id") ON DELETE CASCADE;


--
-- Name: menus menus_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: menus menus_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE SET NULL;


--
-- Name: notifications notifications_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: onboarding_progress onboarding_progress_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."onboarding_progress"
    ADD CONSTRAINT "onboarding_progress_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: order_items order_items_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE RESTRICT;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;


--
-- Name: order_items order_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: order_mutation_requests order_mutation_requests_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_mutation_requests"
    ADD CONSTRAINT "order_mutation_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: order_notes order_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_notes"
    ADD CONSTRAINT "order_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL;


--
-- Name: order_notes order_notes_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_notes"
    ADD CONSTRAINT "order_notes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;


--
-- Name: order_notes order_notes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_notes"
    ADD CONSTRAINT "order_notes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: orders orders_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL;


--
-- Name: orders orders_cashier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL;


--
-- Name: orders orders_comped_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_comped_by_fkey" FOREIGN KEY ("comped_by") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL;


--
-- Name: orders orders_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE SET NULL;


--
-- Name: orders orders_house_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_house_account_id_fkey" FOREIGN KEY ("house_account_id") REFERENCES "public"."house_accounts"("id") ON DELETE SET NULL;


--
-- Name: orders orders_server_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL;


--
-- Name: orders orders_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE SET NULL;


--
-- Name: orders orders_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE SET NULL;


--
-- Name: orders orders_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: orders orders_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE SET NULL;


--
-- Name: payments payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL;


--
-- Name: payments payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;


--
-- Name: payments payments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: platform_audit_log platform_audit_log_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."platform_audit_log"
    ADD CONSTRAINT "platform_audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: platform_audit_log platform_audit_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."platform_audit_log"
    ADD CONSTRAINT "platform_audit_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL;


--
-- Name: push_subscriptions push_subscriptions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: qr_designs qr_designs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."qr_designs"
    ADD CONSTRAINT "qr_designs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: recipes recipes_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;


--
-- Name: recipes recipes_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;


--
-- Name: recipes recipes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: restaurant_groups restaurant_groups_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."restaurant_groups"
    ADD CONSTRAINT "restaurant_groups_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."admin_users"("id");


--
-- Name: settings settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: stock_alert_notifications stock_alert_notifications_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_alert_notifications"
    ADD CONSTRAINT "stock_alert_notifications_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;


--
-- Name: stock_alert_notifications stock_alert_notifications_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_alert_notifications"
    ADD CONSTRAINT "stock_alert_notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: stock_count_lines stock_count_lines_count_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_count_lines"
    ADD CONSTRAINT "stock_count_lines_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "public"."stock_counts"("id") ON DELETE CASCADE;


--
-- Name: stock_count_lines stock_count_lines_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_count_lines"
    ADD CONSTRAINT "stock_count_lines_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;


--
-- Name: stock_count_lines stock_count_lines_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_count_lines"
    ADD CONSTRAINT "stock_count_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: stock_counts stock_counts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_counts"
    ADD CONSTRAINT "stock_counts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;


--
-- Name: stock_movements stock_movements_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: suppliers suppliers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: table_assignments table_assignments_server_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."table_assignments"
    ADD CONSTRAINT "table_assignments_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."admin_users"("id") ON DELETE CASCADE;


--
-- Name: table_assignments table_assignments_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."table_assignments"
    ADD CONSTRAINT "table_assignments_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE CASCADE;


--
-- Name: table_assignments table_assignments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."table_assignments"
    ADD CONSTRAINT "table_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: table_sessions table_sessions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."table_sessions"
    ADD CONSTRAINT "table_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: tables tables_qr_design_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_qr_design_id_fkey" FOREIGN KEY ("qr_design_id") REFERENCES "public"."qr_designs"("id") ON DELETE SET NULL;


--
-- Name: tables tables_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: tables tables_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE CASCADE;


--
-- Name: tenant_supports tenant_supports_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenant_supports"
    ADD CONSTRAINT "tenant_supports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: tenants tenants_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: tenants tenants_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."restaurant_groups"("id") ON DELETE SET NULL;


--
-- Name: tenants tenants_suspended_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_suspended_by_fkey" FOREIGN KEY ("suspended_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE CASCADE;


--
-- Name: venues venues_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."venues"
    ADD CONSTRAINT "venues_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: zones zones_qr_design_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."zones"
    ADD CONSTRAINT "zones_qr_design_id_fkey" FOREIGN KEY ("qr_design_id") REFERENCES "public"."qr_designs"("id") ON DELETE SET NULL;


--
-- Name: zones zones_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."zones"
    ADD CONSTRAINT "zones_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


--
-- Name: zones zones_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."zones"
    ADD CONSTRAINT "zones_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE CASCADE;


--
-- Name: ads Admins can delete own tenant ads; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can delete own tenant ads" ON "public"."ads" FOR DELETE USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: announcements Admins can delete own tenant announcements; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can delete own tenant announcements" ON "public"."announcements" FOR DELETE USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: order_items Admins can delete own tenant order items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can delete own tenant order items" ON "public"."order_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))))));


--
-- Name: orders Admins can delete their restaurant orders; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can delete their restaurant orders" ON "public"."orders" FOR DELETE USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: audit_log Admins can insert audit logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can insert audit logs" ON "public"."audit_log" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: notifications Admins can insert notifications; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can insert notifications" ON "public"."notifications" FOR INSERT WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: order_items Admins can insert own tenant order items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can insert own tenant order items" ON "public"."order_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))))));


--
-- Name: announcements Admins can manage announcements; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage announcements" ON "public"."announcements" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));


--
-- Name: ads Admins can manage own tenant ads; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage own tenant ads" ON "public"."ads" FOR INSERT WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: announcements Admins can manage own tenant announcements; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage own tenant announcements" ON "public"."announcements" FOR INSERT WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: categories Admins can manage own tenant categories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage own tenant categories" ON "public"."categories" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: coupons Admins can manage own tenant coupons; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage own tenant coupons" ON "public"."coupons" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: ingredients Admins can manage own tenant ingredients; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage own tenant ingredients" ON "public"."ingredients" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: item_suggestions Admins can manage own tenant item_suggestions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage own tenant item_suggestions" ON "public"."item_suggestions" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: menu_items Admins can manage own tenant menu items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage own tenant menu items" ON "public"."menu_items" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: menus Admins can manage own tenant menus; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage own tenant menus" ON "public"."menus" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: orders Admins can manage own tenant orders; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage own tenant orders" ON "public"."orders" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: recipes Admins can manage own tenant recipes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage own tenant recipes" ON "public"."recipes" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: stock_movements Admins can manage own tenant stock_movements; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage own tenant stock_movements" ON "public"."stock_movements" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: suppliers Admins can manage own tenant suppliers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage own tenant suppliers" ON "public"."suppliers" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: venues Admins can manage own tenant venues; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage own tenant venues" ON "public"."venues" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: item_price_variants Admins can manage price variants; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage price variants" ON "public"."item_price_variants" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: tables Admins can manage tables; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage tables" ON "public"."tables" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));


--
-- Name: orders Admins can manage their restaurant orders; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage their restaurant orders" ON "public"."orders" FOR UPDATE USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: settings Admins can manage their restaurant settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage their restaurant settings" ON "public"."settings" USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: zones Admins can manage zones; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage zones" ON "public"."zones" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));


--
-- Name: audit_log Admins can read audit logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can read audit logs" ON "public"."audit_log" FOR SELECT USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("admin_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))))));


--
-- Name: notifications Admins can read own notifications; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can read own notifications" ON "public"."notifications" FOR SELECT USING ((("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) AND (("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("user_id" IS NULL))));


--
-- Name: notifications Admins can update own notifications; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can update own notifications" ON "public"."notifications" FOR UPDATE USING ((("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) AND (("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("user_id" IS NULL)))) WITH CHECK ((("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) AND (("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("user_id" IS NULL))));


--
-- Name: tenants Admins can update own tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can update own tenant" ON "public"."tenants" FOR UPDATE USING (("id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: ads Admins can update own tenant ads; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can update own tenant ads" ON "public"."ads" FOR UPDATE USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: announcements Admins can update own tenant announcements; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can update own tenant announcements" ON "public"."announcements" FOR UPDATE USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: order_items Admins can update own tenant order items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can update own tenant order items" ON "public"."order_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = ANY ("public"."get_my_tenant_ids_array"())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))))));


--
-- Name: admin_users Admins can view own tenant admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view own tenant admins" ON "public"."admin_users" FOR SELECT USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))));


--
-- Name: ads Admins can view own tenant ads; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view own tenant ads" ON "public"."ads" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: ingredients Admins can view own tenant ingredients; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view own tenant ingredients" ON "public"."ingredients" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: item_suggestions Admins can view own tenant item_suggestions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view own tenant item_suggestions" ON "public"."item_suggestions" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: order_items Admins can view own tenant order items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view own tenant order items" ON "public"."order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))))));


--
-- Name: orders Admins can view own tenant orders; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view own tenant orders" ON "public"."orders" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: recipes Admins can view own tenant recipes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view own tenant recipes" ON "public"."recipes" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: stock_movements Admins can view own tenant stock_movements; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view own tenant stock_movements" ON "public"."stock_movements" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: suppliers Admins can view own tenant suppliers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view own tenant suppliers" ON "public"."suppliers" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: item_options Admins manage item options; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins manage item options" ON "public"."item_options" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: dish_photo_drafts Admins manage own tenant drafts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins manage own tenant drafts" ON "public"."dish_photo_drafts" USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("admin_users"."is_active" = true) AND ("admin_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"])))))) WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("admin_users"."is_active" = true) AND ("admin_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))))));


--
-- Name: item_options Admins manage own tenant item options; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins manage own tenant item options" ON "public"."item_options" TO "authenticated" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: item_price_variants Admins manage own tenant price variants; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins manage own tenant price variants" ON "public"."item_price_variants" TO "authenticated" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: ai_photo_credits Admins read own credits; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins read own credits" ON "public"."ai_photo_credits" FOR SELECT USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("admin_users"."is_active" = true)))));


--
-- Name: ai_credits_ledger Admins read own ledger; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins read own ledger" ON "public"."ai_credits_ledger" FOR SELECT USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("admin_users"."is_active" = true)))));


--
-- Name: tenants Authenticated users can read tenants they belong to; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can read tenants they belong to" ON "public"."tenants" FOR SELECT USING (("id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: admin_users Block super_admin escalation by non-super-admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Block super_admin escalation by non-super-admins" ON "public"."admin_users" AS RESTRICTIVE USING ((((COALESCE("is_super_admin", false) = false) AND ("role" IS DISTINCT FROM 'super_admin'::"text")) OR "public"."is_super_admin"())) WITH CHECK ((((COALESCE("is_super_admin", false) = false) AND ("role" IS DISTINCT FROM 'super_admin'::"text")) OR "public"."is_super_admin"()));


--
-- Name: categories Categories are publicly readable; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Categories are publicly readable" ON "public"."categories" FOR SELECT USING (("is_active" = true));


--
-- Name: newsletter_subscriber Enable delete for service_role only; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable delete for service_role only" ON "public"."newsletter_subscriber" FOR DELETE TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));


--
-- Name: newsletter_subscriber Enable insert for public; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable insert for public" ON "public"."newsletter_subscriber" FOR INSERT WITH CHECK ((("email" IS NOT NULL) AND (("char_length"("email") >= 5) AND ("char_length"("email") <= 255)) AND (POSITION(('@'::"text") IN ("email")) > 1)));


--
-- Name: newsletter_subscriber Enable select for service_role only; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable select for service_role only" ON "public"."newsletter_subscriber" FOR SELECT TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));


--
-- Name: item_modifiers Item modifiers manageable by admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Item modifiers manageable by admins" ON "public"."item_modifiers" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));


--
-- Name: item_modifiers Item modifiers viewable by anon for available items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Item modifiers viewable by anon for available items" ON "public"."item_modifiers" FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."menu_items" "mi"
  WHERE (("mi"."id" = "item_modifiers"."menu_item_id") AND ("mi"."is_available" = true) AND ("mi"."deleted_at" IS NULL)))));


--
-- Name: item_options Item options viewable by anon for available items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Item options viewable by anon for available items" ON "public"."item_options" FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."menu_items" "mi"
  WHERE (("mi"."id" = "item_options"."menu_item_id") AND ("mi"."is_available" = true) AND ("mi"."deleted_at" IS NULL)))));


--
-- Name: zones Members can view own tenant zones; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view own tenant zones" ON "public"."zones" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: admin_users Members update their own admin row; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members update their own admin row" ON "public"."admin_users" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: admin_users Platform-removed admin rows are frozen for tenants; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Platform-removed admin rows are frozen for tenants" ON "public"."admin_users" AS RESTRICTIVE FOR UPDATE USING ((("deleted_at" IS NULL) OR "public"."is_super_admin"())) WITH CHECK ((("deleted_at" IS NULL) OR "public"."is_super_admin"()));


--
-- Name: item_price_variants Price variants viewable by anon for available items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Price variants viewable by anon for available items" ON "public"."item_price_variants" FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."menu_items" "mi"
  WHERE (("mi"."id" = "item_price_variants"."menu_item_id") AND ("mi"."is_available" = true) AND ("mi"."deleted_at" IS NULL)))));


--
-- Name: tenants Public can read active tenants; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can read active tenants" ON "public"."tenants" FOR SELECT USING (("is_active" = true));


--
-- Name: announcements Public can view active announcements; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can view active announcements" ON "public"."announcements" FOR SELECT USING (("is_active" = true));


--
-- Name: menus Public can view active menus; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can view active menus" ON "public"."menus" FOR SELECT USING (("is_active" = true));


--
-- Name: tables Public can view active tables; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can view active tables" ON "public"."tables" FOR SELECT USING (("is_active" = true));


--
-- Name: menu_items Public can view menu items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can view menu items" ON "public"."menu_items" FOR SELECT USING (("deleted_at" IS NULL));


--
-- Name: user_sessions Tenant admins can view tenant sessions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Tenant admins can view tenant sessions" ON "public"."user_sessions" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));


--
-- Name: table_assignments Tenant members can delete assignments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Tenant members can delete assignments" ON "public"."table_assignments" FOR DELETE USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: qr_designs Tenant members can delete qr designs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Tenant members can delete qr designs" ON "public"."qr_designs" FOR DELETE USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = "auth"."uid"()) AND "admin_users"."is_active"))));


--
-- Name: table_assignments Tenant members can insert assignments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Tenant members can insert assignments" ON "public"."table_assignments" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: qr_designs Tenant members can insert qr designs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Tenant members can insert qr designs" ON "public"."qr_designs" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = "auth"."uid"()) AND "admin_users"."is_active"))));


--
-- Name: table_assignments Tenant members can update assignments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Tenant members can update assignments" ON "public"."table_assignments" FOR UPDATE USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: qr_designs Tenant members can update qr designs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Tenant members can update qr designs" ON "public"."qr_designs" FOR UPDATE USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = "auth"."uid"()) AND "admin_users"."is_active")))) WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = "auth"."uid"()) AND "admin_users"."is_active"))));


--
-- Name: table_assignments Tenant members can view assignments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Tenant members can view assignments" ON "public"."table_assignments" FOR SELECT USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: qr_designs Tenant members can view qr designs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Tenant members can view qr designs" ON "public"."qr_designs" FOR SELECT USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = "auth"."uid"()) AND "admin_users"."is_active"))));


--
-- Name: onboarding_progress Users can insert own onboarding_progress; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert own onboarding_progress" ON "public"."onboarding_progress" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: user_preferences Users can insert own preferences; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert own preferences" ON "public"."user_preferences" FOR INSERT WITH CHECK (("user_id" IN ( SELECT "admin_users"."id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: user_sessions Users can insert own sessions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert own sessions" ON "public"."user_sessions" FOR INSERT WITH CHECK (("user_id" IN ( SELECT "admin_users"."id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: push_subscriptions Users can manage own push subscriptions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage own push subscriptions" ON "public"."push_subscriptions" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: onboarding_progress Users can update own onboarding_progress; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own onboarding_progress" ON "public"."onboarding_progress" FOR UPDATE USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: user_preferences Users can update own preferences; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own preferences" ON "public"."user_preferences" FOR UPDATE USING (("user_id" IN ( SELECT "admin_users"."id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("user_id" IN ( SELECT "admin_users"."id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: onboarding_progress Users can view own onboarding_progress; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own onboarding_progress" ON "public"."onboarding_progress" FOR SELECT USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: user_preferences Users can view own preferences; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own preferences" ON "public"."user_preferences" FOR SELECT USING ((("user_id" IN ( SELECT "admin_users"."id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR ("user_id" IN ( SELECT "au"."id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))))));


--
-- Name: user_sessions Users can view own sessions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own sessions" ON "public"."user_sessions" FOR SELECT USING (("user_id" IN ( SELECT "admin_users"."id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: venues Venues are publicly readable; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Venues are publicly readable" ON "public"."venues" FOR SELECT USING (("is_active" = true));


--
-- Name: admin_users; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;

--
-- Name: ads; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ads" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_credits_ledger; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_credits_ledger" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_photo_credits; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_photo_credits" ENABLE ROW LEVEL SECURITY;

--
-- Name: announcements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;

--
-- Name: categories atfood_insert_categories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "atfood_insert_categories" ON "public"."categories" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("admin_users"."tenant_id" = "categories"."tenant_id") AND ("admin_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"])) AND (("admin_users"."is_active" IS NULL) OR ("admin_users"."is_active" = true))))));


--
-- Name: menu_items atfood_insert_menu_items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "atfood_insert_menu_items" ON "public"."menu_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("admin_users"."tenant_id" = "menu_items"."tenant_id") AND ("admin_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"])) AND (("admin_users"."is_active" IS NULL) OR ("admin_users"."is_active" = true))))));


--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;

--
-- Name: coupon_redemptions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."coupon_redemptions" ENABLE ROW LEVEL SECURITY;

--
-- Name: coupon_redemptions coupon_redemptions_tenant_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "coupon_redemptions_tenant_select" ON "public"."coupon_redemptions" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: coupons; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."coupons" ENABLE ROW LEVEL SECURITY;

--
-- Name: dish_photo_drafts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."dish_photo_drafts" ENABLE ROW LEVEL SECURITY;

--
-- Name: tenants group_owner_can_read_tenants; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "group_owner_can_read_tenants" ON "public"."tenants" FOR SELECT USING (("group_id" IN ( SELECT "restaurant_groups"."id"
   FROM "public"."restaurant_groups"
  WHERE ("restaurant_groups"."owner_user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: house_accounts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."house_accounts" ENABLE ROW LEVEL SECURITY;

--
-- Name: house_accounts house_accounts_tenant_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "house_accounts_tenant_delete" ON "public"."house_accounts" FOR DELETE TO "authenticated" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: house_accounts house_accounts_tenant_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "house_accounts_tenant_insert" ON "public"."house_accounts" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: house_accounts house_accounts_tenant_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "house_accounts_tenant_select" ON "public"."house_accounts" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: house_accounts house_accounts_tenant_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "house_accounts_tenant_update" ON "public"."house_accounts" FOR UPDATE TO "authenticated" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: ingredients; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ingredients" ENABLE ROW LEVEL SECURITY;

--
-- Name: ingredients ingredients_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ingredients_insert" ON "public"."ingredients" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: ingredients ingredients_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ingredients_update" ON "public"."ingredients" FOR UPDATE USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: invitations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;

--
-- Name: item_modifiers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."item_modifiers" ENABLE ROW LEVEL SECURITY;

--
-- Name: item_options; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."item_options" ENABLE ROW LEVEL SECURITY;

--
-- Name: item_price_variants; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."item_price_variants" ENABLE ROW LEVEL SECURITY;

--
-- Name: item_suggestions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."item_suggestions" ENABLE ROW LEVEL SECURITY;

--
-- Name: item_suggestions item_suggestions_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "item_suggestions_delete" ON "public"."item_suggestions" FOR DELETE USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: item_suggestions item_suggestions_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "item_suggestions_insert" ON "public"."item_suggestions" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: item_suggestions item_suggestions_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "item_suggestions_update" ON "public"."item_suggestions" FOR UPDATE USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: menu_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."menu_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: menus; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."menus" ENABLE ROW LEVEL SECURITY;

--
-- Name: newsletter_subscriber; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."newsletter_subscriber" ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

--
-- Name: onboarding_progress; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."onboarding_progress" ENABLE ROW LEVEL SECURITY;

--
-- Name: orange_money_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."orange_money_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: orange_money_events orange_money_events_service_only; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "orange_money_events_service_only" ON "public"."orange_money_events" AS RESTRICTIVE TO "authenticated", "anon" USING (false);


--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items order_items_tenant_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "order_items_tenant_select" ON "public"."order_items" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: order_mutation_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."order_mutation_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: order_mutation_requests order_mutation_requests_tenant_rw; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "order_mutation_requests_tenant_rw" ON "public"."order_mutation_requests" TO "authenticated" USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = "auth"."uid"()) AND "admin_users"."is_active")))) WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = "auth"."uid"()) AND "admin_users"."is_active"))));


--
-- Name: order_notes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."order_notes" ENABLE ROW LEVEL SECURITY;

--
-- Name: order_notes order_notes_tenant_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "order_notes_tenant_insert" ON "public"."order_notes" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: order_notes order_notes_tenant_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "order_notes_tenant_select" ON "public"."order_notes" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;

--
-- Name: restaurant_groups owner_can_delete_own_group; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "owner_can_delete_own_group" ON "public"."restaurant_groups" FOR DELETE TO "authenticated" USING (("owner_user_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: restaurant_groups owner_can_insert_own_group; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "owner_can_insert_own_group" ON "public"."restaurant_groups" FOR INSERT WITH CHECK (("owner_user_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: role_permissions owner_can_manage_role_permissions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "owner_can_manage_role_permissions" ON "public"."role_permissions" USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("admin_users"."role" = 'owner'::"text"))))) WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("admin_users"."role" = 'owner'::"text")))));


--
-- Name: restaurant_groups owner_can_select_own_group; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "owner_can_select_own_group" ON "public"."restaurant_groups" FOR SELECT USING (("owner_user_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: restaurant_groups owner_can_update_own_group; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "owner_can_update_own_group" ON "public"."restaurant_groups" FOR UPDATE USING (("owner_user_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;

--
-- Name: payments payments_tenant_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "payments_tenant_insert" ON "public"."payments" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: payments payments_tenant_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "payments_tenant_select" ON "public"."payments" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: platform_audit_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."platform_audit_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;

--
-- Name: qr_designs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."qr_designs" ENABLE ROW LEVEL SECURITY;

--
-- Name: recipes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."recipes" ENABLE ROW LEVEL SECURITY;

--
-- Name: recipes recipes_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "recipes_delete" ON "public"."recipes" FOR DELETE USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: recipes recipes_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "recipes_insert" ON "public"."recipes" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: recipes recipes_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "recipes_update" ON "public"."recipes" FOR UPDATE USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: restaurant_groups; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."restaurant_groups" ENABLE ROW LEVEL SECURITY;

--
-- Name: role_permissions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;

--
-- Name: restaurant_groups service_role_full_access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "service_role_full_access" ON "public"."restaurant_groups" TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text")) WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));


--
-- Name: invitations service_role_full_access_invitations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "service_role_full_access_invitations" ON "public"."invitations" TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text")) WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));


--
-- Name: role_permissions service_role_full_access_role_permissions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "service_role_full_access_role_permissions" ON "public"."role_permissions" TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text")) WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));


--
-- Name: settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_alert_notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."stock_alert_notifications" ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_alert_notifications stock_alert_notifications_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "stock_alert_notifications_delete" ON "public"."stock_alert_notifications" FOR DELETE USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: stock_alert_notifications stock_alert_notifications_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "stock_alert_notifications_insert" ON "public"."stock_alert_notifications" FOR INSERT WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: stock_alert_notifications stock_alert_notifications_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "stock_alert_notifications_update" ON "public"."stock_alert_notifications" FOR UPDATE USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: stock_alert_notifications stock_alerts_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "stock_alerts_select" ON "public"."stock_alert_notifications" FOR SELECT USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: stock_count_lines; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."stock_count_lines" ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_count_lines stock_count_lines_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "stock_count_lines_delete" ON "public"."stock_count_lines" FOR DELETE USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: stock_count_lines stock_count_lines_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "stock_count_lines_insert" ON "public"."stock_count_lines" FOR INSERT WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: stock_count_lines stock_count_lines_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "stock_count_lines_select" ON "public"."stock_count_lines" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: stock_count_lines stock_count_lines_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "stock_count_lines_update" ON "public"."stock_count_lines" FOR UPDATE USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: stock_counts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."stock_counts" ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_counts stock_counts_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "stock_counts_delete" ON "public"."stock_counts" FOR DELETE USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: stock_counts stock_counts_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "stock_counts_insert" ON "public"."stock_counts" FOR INSERT WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: stock_counts stock_counts_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "stock_counts_select" ON "public"."stock_counts" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: stock_counts stock_counts_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "stock_counts_update" ON "public"."stock_counts" FOR UPDATE USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: stock_movements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_movements stock_movements_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "stock_movements_insert" ON "public"."stock_movements" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: stripe_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."stripe_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers suppliers_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "suppliers_delete" ON "public"."suppliers" FOR DELETE USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: suppliers suppliers_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "suppliers_insert" ON "public"."suppliers" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: suppliers suppliers_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "suppliers_update" ON "public"."suppliers" FOR UPDATE USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: table_assignments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."table_assignments" ENABLE ROW LEVEL SECURITY;

--
-- Name: table_sessions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."table_sessions" ENABLE ROW LEVEL SECURITY;

--
-- Name: table_sessions table_sessions_tenant_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "table_sessions_tenant_select" ON "public"."table_sessions" FOR SELECT TO "authenticated" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: table_sessions table_sessions_tenant_write; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "table_sessions_tenant_write" ON "public"."table_sessions" TO "authenticated" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));


--
-- Name: tables; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tables" ENABLE ROW LEVEL SECURITY;

--
-- Name: invitations tenant_admins_can_insert_invitations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tenant_admins_can_insert_invitations" ON "public"."invitations" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("admin_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));


--
-- Name: invitations tenant_admins_can_update_invitations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tenant_admins_can_update_invitations" ON "public"."invitations" FOR UPDATE USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("admin_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));


--
-- Name: invitations tenant_admins_can_view_invitations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tenant_admins_can_view_invitations" ON "public"."invitations" FOR SELECT USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("admin_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));


--
-- Name: role_permissions tenant_members_can_view_role_permissions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tenant_members_can_view_role_permissions" ON "public"."role_permissions" FOR SELECT USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: tenant_supports; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tenant_supports" ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_supports tenant_supports_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tenant_supports_delete" ON "public"."tenant_supports" FOR DELETE USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: tenant_supports tenant_supports_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tenant_supports_insert" ON "public"."tenant_supports" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: tenant_supports tenant_supports_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tenant_supports_select" ON "public"."tenant_supports" FOR SELECT USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: tenant_supports tenant_supports_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tenant_supports_update" ON "public"."tenant_supports" FOR UPDATE USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: tenants; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_preferences; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_preferences" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_sessions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_sessions" ENABLE ROW LEVEL SECURITY;

--
-- Name: venues; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."venues" ENABLE ROW LEVEL SECURITY;

--
-- Name: wave_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."wave_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: wave_events wave_events_service_only; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "wave_events_service_only" ON "public"."wave_events" AS RESTRICTIVE TO "authenticated", "anon" USING (false);


--
-- Name: zones; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."zones" ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "accept_invitation_membership"("p_invitation_id" "uuid", "p_user_id" "uuid", "p_full_name" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."accept_invitation_membership"("p_invitation_id" "uuid", "p_user_id" "uuid", "p_full_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_invitation_membership"("p_invitation_id" "uuid", "p_user_id" "uuid", "p_full_name" "text") TO "service_role";


--
-- Name: FUNCTION "adjust_ingredient_stock_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_delta" numeric, "p_movement_type" "text", "p_notes" "text", "p_created_by" "uuid", "p_supplier_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."adjust_ingredient_stock_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_delta" numeric, "p_movement_type" "text", "p_notes" "text", "p_created_by" "uuid", "p_supplier_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_ingredient_stock_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_delta" numeric, "p_movement_type" "text", "p_notes" "text", "p_created_by" "uuid", "p_supplier_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_ingredient_stock_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_delta" numeric, "p_movement_type" "text", "p_notes" "text", "p_created_by" "uuid", "p_supplier_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "assert_tenant_member"("p_tenant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."assert_tenant_member"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assert_tenant_member"("p_tenant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "auto_create_user_preferences"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."auto_create_user_preferences"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_create_user_preferences"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_create_user_preferences"() TO "service_role";


--
-- Name: FUNCTION "broadcast_order_status"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."broadcast_order_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."broadcast_order_status"() TO "service_role";


--
-- Name: FUNCTION "cancel_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."cancel_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "claim_activation_event"("p_tenant_id" "uuid", "p_event_key" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."claim_activation_event"("p_tenant_id" "uuid", "p_event_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_activation_event"("p_tenant_id" "uuid", "p_event_key" "text") TO "service_role";


--
-- Name: FUNCTION "claim_coupon_usage"("p_coupon_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."claim_coupon_usage"("p_coupon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_coupon_usage"("p_coupon_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_coupon_usage"("p_coupon_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "commit_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_committed_by" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."commit_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_committed_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."commit_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_committed_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."commit_stock_count"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_committed_by" "uuid") TO "service_role";


--
-- Name: FUNCTION "create_order_with_items"("p_tenant_id" "uuid", "p_order_number" "text", "p_total" bigint, "p_table_number" "text", "p_customer_name" "text", "p_customer_phone" "text", "p_notes" "text", "p_service_type" "text", "p_room_number" "text", "p_delivery_address" "text", "p_subtotal" bigint, "p_tax_amount" bigint, "p_service_charge_amount" bigint, "p_discount_amount" bigint, "p_tip_amount" bigint, "p_coupon_id" "uuid", "p_server_id" "uuid", "p_display_currency" "text", "p_preparation_zone" "text", "p_items" "jsonb", "p_client_request_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."create_order_with_items"("p_tenant_id" "uuid", "p_order_number" "text", "p_total" bigint, "p_table_number" "text", "p_customer_name" "text", "p_customer_phone" "text", "p_notes" "text", "p_service_type" "text", "p_room_number" "text", "p_delivery_address" "text", "p_subtotal" bigint, "p_tax_amount" bigint, "p_service_charge_amount" bigint, "p_discount_amount" bigint, "p_tip_amount" bigint, "p_coupon_id" "uuid", "p_server_id" "uuid", "p_display_currency" "text", "p_preparation_zone" "text", "p_items" "jsonb", "p_client_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_order_with_items"("p_tenant_id" "uuid", "p_order_number" "text", "p_total" bigint, "p_table_number" "text", "p_customer_name" "text", "p_customer_phone" "text", "p_notes" "text", "p_service_type" "text", "p_room_number" "text", "p_delivery_address" "text", "p_subtotal" bigint, "p_tax_amount" bigint, "p_service_charge_amount" bigint, "p_discount_amount" bigint, "p_tip_amount" bigint, "p_coupon_id" "uuid", "p_server_id" "uuid", "p_display_currency" "text", "p_preparation_zone" "text", "p_items" "jsonb", "p_client_request_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "delete_admin_user_atomic"("p_admin_user_id" "uuid", "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."delete_admin_user_atomic"("p_admin_user_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_admin_user_atomic"("p_admin_user_id" "uuid", "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "destock_order"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."destock_order"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."destock_order"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid") TO "service_role";


--
-- Name: FUNCTION "enforce_inventory_entitlement"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enforce_inventory_entitlement"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_inventory_entitlement"() TO "service_role";


--
-- Name: FUNCTION "enforce_min_one_active_venue"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enforce_min_one_active_venue"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_min_one_active_venue"() TO "service_role";


--
-- Name: FUNCTION "enforce_qr_customization_entitlement"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enforce_qr_customization_entitlement"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_qr_customization_entitlement"() TO "service_role";


--
-- Name: FUNCTION "enforce_tenant_name_cross_group_unique"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enforce_tenant_name_cross_group_unique"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_tenant_name_cross_group_unique"() TO "service_role";


--
-- Name: FUNCTION "enforce_venue_plan_limit"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enforce_venue_plan_limit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_venue_plan_limit"() TO "service_role";


--
-- Name: FUNCTION "expire_stale_payment_sessions"("p_max_age_minutes" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."expire_stale_payment_sessions"("p_max_age_minutes" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_stale_payment_sessions"("p_max_age_minutes" integer) TO "service_role";


--
-- Name: FUNCTION "generate_menu_slug"("p_tenant_id" "uuid", "p_name" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."generate_menu_slug"("p_tenant_id" "uuid", "p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_menu_slug"("p_tenant_id" "uuid", "p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_menu_slug"("p_tenant_id" "uuid", "p_name" "text") TO "service_role";


--
-- Name: FUNCTION "get_category_breakdown"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_category_breakdown"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_category_breakdown"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_category_breakdown"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_co_ordered_items"("p_tenant_id" "uuid", "p_cart_ids" "uuid"[], "p_limit" integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_co_ordered_items"("p_tenant_id" "uuid", "p_cart_ids" "uuid"[], "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_co_ordered_items"("p_tenant_id" "uuid", "p_cart_ids" "uuid"[], "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_co_ordered_items"("p_tenant_id" "uuid", "p_cart_ids" "uuid"[], "p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "get_daily_comps"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_daily_comps"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_daily_comps"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_daily_comps"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_daily_revenue"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_daily_revenue"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_daily_revenue"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_daily_revenue"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_house_account_balances"("p_tenant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_house_account_balances"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_house_account_balances"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_house_account_balances"("p_tenant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_losses_by_reason"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_losses_by_reason"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_losses_by_reason"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_losses_by_reason"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_my_tenant_ids"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_my_tenant_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_tenant_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_tenant_ids"() TO "service_role";


--
-- Name: FUNCTION "get_my_tenant_ids_array"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_my_tenant_ids_array"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_tenant_ids_array"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_tenant_ids_array"() TO "service_role";


--
-- Name: FUNCTION "get_order_summary"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_order_summary"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_order_summary"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_order_summary"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_orders_for_tracking"("p_tenant_id" "uuid", "p_order_ids" "uuid"[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_orders_for_tracking"("p_tenant_id" "uuid", "p_order_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_orders_for_tracking"("p_tenant_id" "uuid", "p_order_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_orders_for_tracking"("p_tenant_id" "uuid", "p_order_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_orders_for_tracking"("p_tenant_id" "uuid", "p_order_ids" "uuid"[]) TO "service_role";


--
-- Name: FUNCTION "get_owner_dashboard"("p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_owner_dashboard"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_owner_dashboard"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_owner_dashboard"("p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_server_performance"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_server_performance"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_server_performance"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_server_performance"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_staff_stock_report"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_staff_stock_report"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_staff_stock_report"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_staff_stock_report"("p_tenant_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_stock_movements_page"("p_tenant_id" "uuid", "p_limit" integer, "p_offset" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_stock_movements_page"("p_tenant_id" "uuid", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_stock_movements_page"("p_tenant_id" "uuid", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stock_movements_page"("p_tenant_id" "uuid", "p_limit" integer, "p_offset" integer) TO "service_role";


--
-- Name: FUNCTION "get_stock_status"("p_tenant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_stock_status"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_stock_status"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stock_status"("p_tenant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_tenant_by_slug"("p_slug" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_tenant_by_slug"("p_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tenant_by_slug"("p_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tenant_by_slug"("p_slug" "text") TO "service_role";


--
-- Name: FUNCTION "get_tenant_public_by_id"("p_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_tenant_public_by_id"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_tenant_public_by_id"("p_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_top_items"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_top_items"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_top_items"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_items"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "import_recipes_tx"("p_tenant_id" "uuid", "p_rows" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."import_recipes_tx"("p_tenant_id" "uuid", "p_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_recipes_tx"("p_tenant_id" "uuid", "p_rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."import_recipes_tx"("p_tenant_id" "uuid", "p_rows" "jsonb") TO "service_role";


--
-- Name: FUNCTION "increment_login_count"("admin_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."increment_login_count"("admin_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_login_count"("admin_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_login_count"("admin_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "increment_menu_item_favorites"("p_item" "uuid", "p_tenant" "uuid", "p_delta" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."increment_menu_item_favorites"("p_item" "uuid", "p_tenant" "uuid", "p_delta" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_menu_item_favorites"("p_item" "uuid", "p_tenant" "uuid", "p_delta" integer) TO "service_role";


--
-- Name: FUNCTION "is_super_admin"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";


--
-- Name: FUNCTION "is_table_occupied"("p_tenant_id" "uuid", "p_table_number" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."is_table_occupied"("p_tenant_id" "uuid", "p_table_number" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_table_occupied"("p_tenant_id" "uuid", "p_table_number" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_table_occupied"("p_tenant_id" "uuid", "p_table_number" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_table_occupied"("p_tenant_id" "uuid", "p_table_number" "text") TO "service_role";


--
-- Name: FUNCTION "next_order_number"("p_tenant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."next_order_number"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."next_order_number"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_order_number"("p_tenant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "open_stock_count"("p_tenant_id" "uuid", "p_reference" "text", "p_created_by" "uuid", "p_ingredient_ids" "uuid"[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."open_stock_count"("p_tenant_id" "uuid", "p_reference" "text", "p_created_by" "uuid", "p_ingredient_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."open_stock_count"("p_tenant_id" "uuid", "p_reference" "text", "p_created_by" "uuid", "p_ingredient_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."open_stock_count"("p_tenant_id" "uuid", "p_reference" "text", "p_created_by" "uuid", "p_ingredient_ids" "uuid"[]) TO "service_role";


--
-- Name: FUNCTION "prevent_super_admin_elevation"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."prevent_super_admin_elevation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_super_admin_elevation"() TO "service_role";


--
-- Name: FUNCTION "provision_group_restaurant"("p_group_id" "uuid", "p_user_id" "uuid", "p_email" "text", "p_name" "text", "p_slug" "text", "p_type" "text", "p_plan" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."provision_group_restaurant"("p_group_id" "uuid", "p_user_id" "uuid", "p_email" "text", "p_name" "text", "p_slug" "text", "p_type" "text", "p_plan" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provision_group_restaurant"("p_group_id" "uuid", "p_user_id" "uuid", "p_email" "text", "p_name" "text", "p_slug" "text", "p_type" "text", "p_plan" "text") TO "service_role";


--
-- Name: FUNCTION "provision_signup_tenant"("p_slug" "text", "p_name" "text", "p_plan" "text", "p_user_id" "uuid", "p_email" "text", "p_full_name" "text", "p_phone" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."provision_signup_tenant"("p_slug" "text", "p_name" "text", "p_plan" "text", "p_user_id" "uuid", "p_email" "text", "p_full_name" "text", "p_phone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provision_signup_tenant"("p_slug" "text", "p_name" "text", "p_plan" "text", "p_user_id" "uuid", "p_email" "text", "p_full_name" "text", "p_phone" "text") TO "service_role";


--
-- Name: FUNCTION "reassign_order_table"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_new_table_number" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reassign_order_table"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_new_table_number" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reassign_order_table"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_new_table_number" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reassign_order_table"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_new_table_number" "text") TO "service_role";


--
-- Name: FUNCTION "reconcile_stock_ledger"("p_tenant_id" "uuid", "p_created_by" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reconcile_stock_ledger"("p_tenant_id" "uuid", "p_created_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reconcile_stock_ledger"("p_tenant_id" "uuid", "p_created_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reconcile_stock_ledger"("p_tenant_id" "uuid", "p_created_by" "uuid") TO "service_role";


--
-- Name: FUNCTION "record_loss_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_reason_code" "text", "p_notes" "text", "p_created_by" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."record_loss_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_reason_code" "text", "p_notes" "text", "p_created_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_loss_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_reason_code" "text", "p_notes" "text", "p_created_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_loss_tx"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_reason_code" "text", "p_notes" "text", "p_created_by" "uuid") TO "service_role";


--
-- Name: FUNCTION "record_refund"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_amount" numeric, "p_method" "text", "p_created_by" "uuid", "p_client_request_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."record_refund"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_amount" numeric, "p_method" "text", "p_created_by" "uuid", "p_client_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_refund"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_amount" numeric, "p_method" "text", "p_created_by" "uuid", "p_client_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_refund"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_amount" numeric, "p_method" "text", "p_created_by" "uuid", "p_client_request_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "reset_tenant_data"("p_tenant_id" "uuid", "p_reset_type" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reset_tenant_data"("p_tenant_id" "uuid", "p_reset_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_tenant_data"("p_tenant_id" "uuid", "p_reset_type" "text") TO "service_role";


--
-- Name: FUNCTION "restock_order"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."restock_order"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restock_order"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid") TO "service_role";


--
-- Name: FUNCTION "save_stock_count_lines"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_lines" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."save_stock_count_lines"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_lines" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_stock_count_lines"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_lines" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_stock_count_lines"("p_tenant_id" "uuid", "p_count_id" "uuid", "p_lines" "jsonb") TO "service_role";


--
-- Name: FUNCTION "set_opening_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_created_by" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."set_opening_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_created_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_opening_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_created_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_opening_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric, "p_created_by" "uuid") TO "service_role";


--
-- Name: FUNCTION "set_order_item_tenant_id"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."set_order_item_tenant_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_order_item_tenant_id"() TO "service_role";


--
-- Name: FUNCTION "set_qr_designs_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."set_qr_designs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_qr_designs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_qr_designs_updated_at"() TO "service_role";


--
-- Name: FUNCTION "set_recipe_tx"("p_tenant_id" "uuid", "p_menu_item_id" "uuid", "p_lines" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."set_recipe_tx"("p_tenant_id" "uuid", "p_menu_item_id" "uuid", "p_lines" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_recipe_tx"("p_tenant_id" "uuid", "p_menu_item_id" "uuid", "p_lines" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_recipe_tx"("p_tenant_id" "uuid", "p_menu_item_id" "uuid", "p_lines" "jsonb") TO "service_role";


--
-- Name: FUNCTION "set_trial_end_date"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."set_trial_end_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_trial_end_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_trial_end_date"() TO "service_role";


--
-- Name: FUNCTION "unclaim_coupon_usage"("p_coupon_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."unclaim_coupon_usage"("p_coupon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unclaim_coupon_usage"("p_coupon_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unclaim_coupon_usage"("p_coupon_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "update_ingredients_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_ingredients_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ingredients_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ingredients_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_menus_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_menus_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_menus_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_menus_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_suppliers_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_suppliers_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_suppliers_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_suppliers_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_tenant_supports_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_tenant_supports_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_tenant_supports_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tenant_supports_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_updated_at_column"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


--
-- Name: FUNCTION "update_user_preferences_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_user_preferences_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_preferences_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_preferences_updated_at"() TO "service_role";


--
-- Name: FUNCTION "verify_stock_ledger"("p_tenant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."verify_stock_ledger"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_stock_ledger"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_stock_ledger"("p_tenant_id" "uuid") TO "service_role";


--
-- Name: TABLE "admin_users"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."admin_users" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."admin_users" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_users" TO "service_role";


--
-- Name: COLUMN "admin_users"."full_name"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("full_name") ON TABLE "public"."admin_users" TO "authenticated";


--
-- Name: COLUMN "admin_users"."last_login"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("last_login") ON TABLE "public"."admin_users" TO "authenticated";


--
-- Name: COLUMN "admin_users"."phone"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("phone") ON TABLE "public"."admin_users" TO "authenticated";


--
-- Name: COLUMN "admin_users"."last_login_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("last_login_at") ON TABLE "public"."admin_users" TO "authenticated";


--
-- Name: COLUMN "admin_users"."login_count"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("login_count") ON TABLE "public"."admin_users" TO "authenticated";


--
-- Name: TABLE "ads"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ads" TO "authenticated";
GRANT ALL ON TABLE "public"."ads" TO "service_role";


--
-- Name: TABLE "ai_credits_ledger"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."ai_credits_ledger" TO "anon";
GRANT ALL ON TABLE "public"."ai_credits_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_credits_ledger" TO "service_role";


--
-- Name: TABLE "ai_photo_credits"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."ai_photo_credits" TO "anon";
GRANT ALL ON TABLE "public"."ai_photo_credits" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_photo_credits" TO "service_role";


--
-- Name: TABLE "announcements"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";


--
-- Name: TABLE "audit_log"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";


--
-- Name: TABLE "categories"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";


--
-- Name: TABLE "coupon_redemptions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."coupon_redemptions" TO "anon";
GRANT ALL ON TABLE "public"."coupon_redemptions" TO "authenticated";
GRANT ALL ON TABLE "public"."coupon_redemptions" TO "service_role";


--
-- Name: TABLE "coupons"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."coupons" TO "authenticated";
GRANT ALL ON TABLE "public"."coupons" TO "service_role";


--
-- Name: TABLE "dish_photo_drafts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."dish_photo_drafts" TO "anon";
GRANT ALL ON TABLE "public"."dish_photo_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."dish_photo_drafts" TO "service_role";


--
-- Name: TABLE "house_accounts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."house_accounts" TO "anon";
GRANT ALL ON TABLE "public"."house_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."house_accounts" TO "service_role";


--
-- Name: TABLE "ingredients"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."ingredients" TO "anon";
GRANT ALL ON TABLE "public"."ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredients" TO "service_role";


--
-- Name: TABLE "invitations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."invitations" TO "service_role";


--
-- Name: COLUMN "invitations"."id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("id") ON TABLE "public"."invitations" TO "authenticated";


--
-- Name: COLUMN "invitations"."tenant_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("tenant_id") ON TABLE "public"."invitations" TO "authenticated";


--
-- Name: COLUMN "invitations"."email"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("email") ON TABLE "public"."invitations" TO "authenticated";


--
-- Name: COLUMN "invitations"."role"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("role") ON TABLE "public"."invitations" TO "authenticated";


--
-- Name: COLUMN "invitations"."custom_permissions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("custom_permissions") ON TABLE "public"."invitations" TO "authenticated";


--
-- Name: COLUMN "invitations"."invited_by"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("invited_by") ON TABLE "public"."invitations" TO "authenticated";


--
-- Name: COLUMN "invitations"."expires_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("expires_at") ON TABLE "public"."invitations" TO "authenticated";


--
-- Name: COLUMN "invitations"."status"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("status") ON TABLE "public"."invitations" TO "authenticated";


--
-- Name: COLUMN "invitations"."created_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("created_at") ON TABLE "public"."invitations" TO "authenticated";


--
-- Name: COLUMN "invitations"."accepted_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("accepted_at") ON TABLE "public"."invitations" TO "authenticated";


--
-- Name: TABLE "item_modifiers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."item_modifiers" TO "anon";
GRANT ALL ON TABLE "public"."item_modifiers" TO "authenticated";
GRANT ALL ON TABLE "public"."item_modifiers" TO "service_role";


--
-- Name: TABLE "item_options"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."item_options" TO "anon";
GRANT ALL ON TABLE "public"."item_options" TO "authenticated";
GRANT ALL ON TABLE "public"."item_options" TO "service_role";


--
-- Name: TABLE "item_price_variants"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."item_price_variants" TO "anon";
GRANT ALL ON TABLE "public"."item_price_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."item_price_variants" TO "service_role";


--
-- Name: TABLE "item_suggestions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."item_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."item_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."item_suggestions" TO "service_role";


--
-- Name: TABLE "menu_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."menu_items" TO "anon";
GRANT ALL ON TABLE "public"."menu_items" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_items" TO "service_role";


--
-- Name: TABLE "menus"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."menus" TO "anon";
GRANT ALL ON TABLE "public"."menus" TO "authenticated";
GRANT ALL ON TABLE "public"."menus" TO "service_role";


--
-- Name: TABLE "newsletter_subscriber"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,MAINTAIN ON TABLE "public"."newsletter_subscriber" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_subscriber" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_subscriber" TO "service_role";


--
-- Name: TABLE "notifications"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";


--
-- Name: TABLE "onboarding_progress"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."onboarding_progress" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_progress" TO "service_role";


--
-- Name: TABLE "orange_money_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."orange_money_events" TO "anon";
GRANT ALL ON TABLE "public"."orange_money_events" TO "authenticated";
GRANT ALL ON TABLE "public"."orange_money_events" TO "service_role";


--
-- Name: TABLE "order_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";


--
-- Name: COLUMN "order_items"."id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("id") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."order_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("order_id") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."menu_item_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("menu_item_id") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."quantity"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("quantity") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."price_at_order"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("price_at_order") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."item_name"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("item_name") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."item_name_en"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("item_name_en") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."created_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("created_at") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."item_status"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("item_status") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."course"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("course") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."modifiers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("modifiers") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."preparation_zone"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("preparation_zone") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."selected_option"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("selected_option") ON TABLE "public"."order_items" TO "anon";


--
-- Name: COLUMN "order_items"."selected_variant"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("selected_variant") ON TABLE "public"."order_items" TO "anon";


--
-- Name: TABLE "order_mutation_requests"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."order_mutation_requests" TO "anon";
GRANT ALL ON TABLE "public"."order_mutation_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."order_mutation_requests" TO "service_role";


--
-- Name: TABLE "order_notes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."order_notes" TO "anon";
GRANT ALL ON TABLE "public"."order_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."order_notes" TO "service_role";


--
-- Name: TABLE "orders"; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";


--
-- Name: COLUMN "orders"."id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("id") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."tenant_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("tenant_id") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."venue_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("venue_id") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."order_number"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("order_number") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."table_number"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("table_number") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."status"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("status") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."subtotal"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("subtotal") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."total"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("total") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."created_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("created_at") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."updated_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("updated_at") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."completed_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("completed_at") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."service_type"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("service_type") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."tax_amount"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("tax_amount") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."service_charge_amount"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("service_charge_amount") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."discount_amount"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("discount_amount") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."payment_method"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("payment_method") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."payment_status"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("payment_status") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."paid_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("paid_at") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."coupon_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("coupon_id") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."assigned_to"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("assigned_to") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."cashier_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("cashier_id") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."server_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("server_id") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."display_currency"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("display_currency") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."tip_amount"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("tip_amount") ON TABLE "public"."orders" TO "anon";


--
-- Name: COLUMN "orders"."preparation_zone"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("preparation_zone") ON TABLE "public"."orders" TO "anon";


--
-- Name: TABLE "payments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";


--
-- Name: TABLE "platform_audit_log"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."platform_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."platform_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_audit_log" TO "service_role";


--
-- Name: TABLE "push_subscriptions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";


--
-- Name: TABLE "qr_designs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."qr_designs" TO "anon";
GRANT ALL ON TABLE "public"."qr_designs" TO "authenticated";
GRANT ALL ON TABLE "public"."qr_designs" TO "service_role";


--
-- Name: TABLE "recipes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."recipes" TO "anon";
GRANT ALL ON TABLE "public"."recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."recipes" TO "service_role";


--
-- Name: TABLE "restaurant_groups"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."restaurant_groups" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_groups" TO "service_role";


--
-- Name: TABLE "role_permissions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";


--
-- Name: TABLE "settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."settings" TO "anon";
GRANT ALL ON TABLE "public"."settings" TO "authenticated";
GRANT ALL ON TABLE "public"."settings" TO "service_role";


--
-- Name: TABLE "stock_alert_notifications"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."stock_alert_notifications" TO "anon";
GRANT ALL ON TABLE "public"."stock_alert_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_alert_notifications" TO "service_role";


--
-- Name: TABLE "stock_count_lines"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."stock_count_lines" TO "anon";
GRANT ALL ON TABLE "public"."stock_count_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_count_lines" TO "service_role";


--
-- Name: TABLE "stock_counts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."stock_counts" TO "anon";
GRANT ALL ON TABLE "public"."stock_counts" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_counts" TO "service_role";


--
-- Name: TABLE "stock_movements"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."stock_movements" TO "anon";
GRANT ALL ON TABLE "public"."stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movements" TO "service_role";


--
-- Name: TABLE "stripe_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."stripe_events" TO "anon";
GRANT ALL ON TABLE "public"."stripe_events" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_events" TO "service_role";


--
-- Name: TABLE "suppliers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";


--
-- Name: TABLE "table_assignments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."table_assignments" TO "anon";
GRANT ALL ON TABLE "public"."table_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."table_assignments" TO "service_role";


--
-- Name: TABLE "table_sessions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."table_sessions" TO "anon";
GRANT ALL ON TABLE "public"."table_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."table_sessions" TO "service_role";


--
-- Name: TABLE "tables"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."tables" TO "anon";
GRANT ALL ON TABLE "public"."tables" TO "authenticated";
GRANT ALL ON TABLE "public"."tables" TO "service_role";


--
-- Name: TABLE "tenant_supports"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."tenant_supports" TO "anon";
GRANT ALL ON TABLE "public"."tenant_supports" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_supports" TO "service_role";


--
-- Name: TABLE "tenants"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";


--
-- Name: COLUMN "tenants"."id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("id") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."slug"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("slug") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("slug") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."name"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("name") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("name") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."logo_url"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("logo_url") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("logo_url") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."primary_color"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("primary_color") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("primary_color") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."is_active"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("is_active") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."updated_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("updated_at") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."onboarding_completed"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("onboarding_completed") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."onboarding_completed_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("onboarding_completed_at") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."secondary_color"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("secondary_color") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("secondary_color") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."description"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("description") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("description") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."establishment_type"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("establishment_type") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("establishment_type") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."address"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("address") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."city"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("city") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."country"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("country") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."phone"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("phone") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."table_count"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("table_count") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("table_count") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."notification_sound_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("notification_sound_id") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."currency"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("currency") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("currency") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."tax_rate"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("tax_rate") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("tax_rate") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."service_charge_rate"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("service_charge_rate") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("service_charge_rate") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."enable_tax"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("enable_tax") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("enable_tax") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."enable_service_charge"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("enable_service_charge") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("enable_service_charge") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."idle_timeout_minutes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("idle_timeout_minutes") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."screen_lock_mode"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("screen_lock_mode") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."default_locale"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("default_locale") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("default_locale") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."supported_currencies"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("supported_currencies") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("supported_currencies") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."enable_coupons"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("enable_coupons") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("enable_coupons") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."bar_display_enabled"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("bar_display_enabled") ON TABLE "public"."tenants" TO "authenticated";


--
-- Name: COLUMN "tenants"."opening_hours"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("opening_hours") ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT("opening_hours") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."custom_domain"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("custom_domain") ON TABLE "public"."tenants" TO "anon";


--
-- Name: COLUMN "tenants"."deleted_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("deleted_at") ON TABLE "public"."tenants" TO "anon";


--
-- Name: TABLE "user_preferences"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."user_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_preferences" TO "service_role";


--
-- Name: TABLE "user_sessions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."user_sessions" TO "anon";
GRANT ALL ON TABLE "public"."user_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_sessions" TO "service_role";


--
-- Name: TABLE "venues"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."venues" TO "anon";
GRANT ALL ON TABLE "public"."venues" TO "authenticated";
GRANT ALL ON TABLE "public"."venues" TO "service_role";


--
-- Name: TABLE "wave_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE "public"."wave_events" TO "anon";
GRANT ALL ON TABLE "public"."wave_events" TO "authenticated";
GRANT ALL ON TABLE "public"."wave_events" TO "service_role";


--
-- Name: TABLE "zones"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."zones" TO "authenticated";
GRANT ALL ON TABLE "public"."zones" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--


