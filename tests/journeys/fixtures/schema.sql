


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."adjust_ingredient_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_delta" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  UPDATE public.ingredients
  SET current_stock = GREATEST(0, current_stock + p_delta),
      updated_at = now()
  WHERE id = p_ingredient_id
    AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingredient not found: % for tenant %', p_ingredient_id, p_tenant_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."adjust_ingredient_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_delta" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assert_tenant_member"("p_tenant_id" "uuid") RETURNS "void"
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


CREATE OR REPLACE FUNCTION "public"."auto_create_user_preferences"() RETURNS "trigger"
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


CREATE OR REPLACE FUNCTION "public"."broadcast_order_status"() RETURNS "trigger"
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


CREATE OR REPLACE FUNCTION "public"."claim_activation_event"("p_tenant_id" "uuid", "p_event_key" "text") RETURNS boolean
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


CREATE OR REPLACE FUNCTION "public"."claim_coupon_usage"("p_coupon_id" "uuid") RETURNS boolean
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


CREATE OR REPLACE FUNCTION "public"."create_order_with_items"("p_tenant_id" "uuid", "p_order_number" "text", "p_total" numeric, "p_table_number" "text" DEFAULT NULL::"text", "p_customer_name" "text" DEFAULT NULL::"text", "p_customer_phone" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text", "p_service_type" "text" DEFAULT 'dine_in'::"text", "p_room_number" "text" DEFAULT NULL::"text", "p_delivery_address" "text" DEFAULT NULL::"text", "p_subtotal" numeric DEFAULT NULL::numeric, "p_tax_amount" numeric DEFAULT 0, "p_service_charge_amount" numeric DEFAULT 0, "p_discount_amount" numeric DEFAULT 0, "p_tip_amount" numeric DEFAULT 0, "p_coupon_id" "uuid" DEFAULT NULL::"uuid", "p_server_id" "uuid" DEFAULT NULL::"uuid", "p_display_currency" "text" DEFAULT NULL::"text", "p_preparation_zone" "text" DEFAULT 'kitchen'::"text", "p_items" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_order_id uuid;
  v_item jsonb;
BEGIN
  IF p_table_number IS NOT NULL
    AND COALESCE(p_service_type, 'dine_in') = 'dine_in'
  THEN
    IF EXISTS (
      SELECT 1
      FROM orders
      WHERE tenant_id = p_tenant_id
        AND table_number = p_table_number
        AND status NOT IN ('delivered', 'cancelled')
    ) THEN
      RAISE EXCEPTION 'TABLE_ACTIVE_ORDER';
    END IF;
  END IF;

  INSERT INTO orders (
    tenant_id, order_number, status, total, table_number,
    customer_name, customer_phone, notes,
    service_type, room_number, delivery_address,
    subtotal, tax_amount, service_charge_amount,
    discount_amount, tip_amount, payment_status,
    coupon_id, server_id, display_currency, preparation_zone
  ) VALUES (
    p_tenant_id, p_order_number, 'pending', p_total, p_table_number,
    p_customer_name, p_customer_phone, p_notes,
    p_service_type, p_room_number, p_delivery_address,
    COALESCE(p_subtotal, p_total), p_tax_amount, p_service_charge_amount,
    p_discount_amount, p_tip_amount, 'pending',
    p_coupon_id, p_server_id, p_display_currency, p_preparation_zone
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
      COALESCE((v_item->>'price_at_order')::numeric, 0),
      v_item->>'customer_notes',
      COALESCE(v_item->'modifiers', '[]'::jsonb),
      v_item->>'course',
      'pending',
      COALESCE(v_item->>'preparation_zone', 'kitchen'),
      v_item->'selected_option',
      v_item->'selected_variant'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', p_order_number,
    'total', p_total
  );
END;
$$;


ALTER FUNCTION "public"."create_order_with_items"("p_tenant_id" "uuid", "p_order_number" "text", "p_total" numeric, "p_table_number" "text", "p_customer_name" "text", "p_customer_phone" "text", "p_notes" "text", "p_service_type" "text", "p_room_number" "text", "p_delivery_address" "text", "p_subtotal" numeric, "p_tax_amount" numeric, "p_service_charge_amount" numeric, "p_discount_amount" numeric, "p_tip_amount" numeric, "p_coupon_id" "uuid", "p_server_id" "uuid", "p_display_currency" "text", "p_preparation_zone" "text", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_admin_user_atomic"("p_admin_user_id" "uuid", "p_user_id" "uuid") RETURNS boolean
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


CREATE OR REPLACE FUNCTION "public"."destock_order"("p_order_id" "uuid", "p_tenant_id" "uuid") RETURNS integer
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

      INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, reference_id)
      VALUES (
        p_tenant_id, v_recipe.ingredient_id, 'order_destock',
        -v_required, p_order_id
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


ALTER FUNCTION "public"."destock_order"("p_order_id" "uuid", "p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_stale_payment_sessions"("p_max_age_minutes" integer DEFAULT 30) RETURNS integer
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


CREATE OR REPLACE FUNCTION "public"."generate_menu_slug"("p_tenant_id" "uuid", "p_name" "text") RETURNS "text"
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


CREATE OR REPLACE FUNCTION "public"."get_co_ordered_items"("p_tenant_id" "uuid", "p_cart_ids" "uuid"[], "p_limit" integer DEFAULT 6) RETURNS TABLE("menu_item_id" "uuid", "frequency" bigint)
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


CREATE OR REPLACE FUNCTION "public"."get_daily_revenue"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("day" "date", "revenue" numeric, "order_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    DATE(o.created_at) AS day,
    COALESCE(SUM(o.total + COALESCE(o.tip_amount, 0)), 0)::NUMERIC AS revenue,
    COUNT(o.id) AS order_count
  FROM orders o
  WHERE o.tenant_id = p_tenant_id
    AND o.created_at >= p_start_date
    AND o.created_at <= p_end_date
    AND o.status != 'cancelled'
  GROUP BY DATE(o.created_at)
  ORDER BY day ASC;
END;
$$;


ALTER FUNCTION "public"."get_daily_revenue"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_tenant_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()
$$;


ALTER FUNCTION "public"."get_my_tenant_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_tenant_ids_array"() RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(array_agg(tenant_id), '{}')
  FROM admin_users
  WHERE user_id = auth.uid()
$$;


ALTER FUNCTION "public"."get_my_tenant_ids_array"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_order_summary"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("total_revenue" numeric, "total_orders" bigint, "avg_basket" numeric, "total_tax" numeric, "total_service_charge" numeric, "total_discounts" numeric, "total_tips" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    COALESCE(SUM(o.total + COALESCE(o.tip_amount, 0)), 0)::NUMERIC AS total_revenue,
    COUNT(o.id)::BIGINT AS total_orders,
    CASE WHEN COUNT(o.id) > 0
      THEN ROUND(SUM(o.total + COALESCE(o.tip_amount, 0)) / COUNT(o.id), 2)
      ELSE 0
    END::NUMERIC AS avg_basket,
    COALESCE(SUM(o.tax_amount), 0)::NUMERIC AS total_tax,
    COALESCE(SUM(o.service_charge_amount), 0)::NUMERIC AS total_service_charge,
    COALESCE(SUM(o.discount_amount), 0)::NUMERIC AS total_discounts,
    COALESCE(SUM(o.tip_amount), 0)::NUMERIC AS total_tips
  FROM orders o
  WHERE o.tenant_id = p_tenant_id
    AND o.created_at >= p_start_date
    AND o.created_at <= p_end_date
    AND o.status != 'cancelled';
END;
$$;


ALTER FUNCTION "public"."get_order_summary"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_orders_for_tracking"("p_tenant_id" "uuid", "p_order_ids" "uuid"[]) RETURNS "jsonb"
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


CREATE OR REPLACE FUNCTION "public"."get_owner_dashboard"("p_user_id" "uuid") RETURNS TABLE("tenant_id" "uuid", "tenant_name" "text", "tenant_slug" "text", "tenant_plan" "text", "tenant_status" "text", "tenant_logo_url" "text", "tenant_is_active" boolean, "orders_today" bigint, "revenue_today" numeric, "orders_month" bigint, "revenue_month" numeric)
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


CREATE OR REPLACE FUNCTION "public"."get_stock_status"("p_tenant_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "unit" "text", "current_stock" numeric, "min_stock_alert" numeric, "cost_per_unit" numeric, "category" "text", "is_active" boolean, "nb_items_using" bigint, "is_low" boolean)
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


CREATE OR REPLACE FUNCTION "public"."get_tenant_by_slug"("p_slug" "text") RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "logo_url" "text", "currency" "text", "tax_rate" numeric, "service_charge_rate" numeric, "enable_tax" boolean, "enable_service_charge" boolean, "establishment_type" "text", "is_active" boolean, "subscription_plan" "text", "subscription_status" "text", "trial_ends_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ SELECT t.id, t.name, t.slug, t.logo_url, t.currency, t.tax_rate, t.service_charge_rate, t.enable_tax, t.enable_service_charge, t.establishment_type, t.is_active, t.subscription_plan, t.subscription_status, t.trial_ends_at FROM tenants t WHERE t.slug = p_slug AND t.is_active = true LIMIT 1; $$;


ALTER FUNCTION "public"."get_tenant_by_slug"("p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tenant_public_by_id"("p_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "currency" "text", "tax_rate" numeric, "service_charge_rate" numeric, "enable_tax" boolean, "enable_service_charge" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ SELECT t.id, t.name, t.slug, t.currency, t.tax_rate, t.service_charge_rate, t.enable_tax, t.enable_service_charge FROM tenants t WHERE t.id = p_id AND t.is_active = true LIMIT 1; $$;


ALTER FUNCTION "public"."get_tenant_public_by_id"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_top_items"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer DEFAULT 10) RETURNS TABLE("item_id" "uuid", "item_name" "text", "quantity_sold" bigint, "revenue" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    oi.menu_item_id AS item_id,
    MAX(oi.item_name)::TEXT AS item_name,
    SUM(oi.quantity)::BIGINT AS quantity_sold,
    SUM(oi.quantity * oi.price_at_order)::NUMERIC AS revenue
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.tenant_id = p_tenant_id
    AND o.created_at >= p_start_date
    AND o.created_at <= p_end_date
    AND o.status != 'cancelled'
  GROUP BY oi.menu_item_id
  ORDER BY quantity_sold DESC
  LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."get_top_items"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_login_count"("admin_user_id" "uuid") RETURNS "void"
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


CREATE OR REPLACE FUNCTION "public"."increment_menu_item_favorites"("p_item" "uuid", "p_tenant" "uuid", "p_delta" integer) RETURNS integer
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


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ SELECT EXISTS ( SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND (is_super_admin = true OR role = 'super_admin') ); $$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_order_number"("p_tenant_id" "uuid") RETURNS "text"
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


CREATE OR REPLACE FUNCTION "public"."prevent_super_admin_elevation"() RETURNS "trigger"
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


COMMENT ON FUNCTION "public"."prevent_super_admin_elevation"() IS 'Blocks non-super_admin callers from granting or revoking super_admin
     role/is_super_admin flag via UPDATE. Service role bypasses.';



CREATE OR REPLACE FUNCTION "public"."provision_signup_tenant"("p_slug" "text", "p_name" "text", "p_plan" "text", "p_user_id" "uuid", "p_email" "text", "p_full_name" "text", "p_phone" "text" DEFAULT NULL::"text") RETURNS "jsonb"
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


CREATE OR REPLACE FUNCTION "public"."reset_tenant_data"("p_tenant_id" "uuid", "p_reset_type" "text") RETURNS json
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


CREATE OR REPLACE FUNCTION "public"."set_opening_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  UPDATE public.ingredients
  SET current_stock = p_quantity, updated_at = now()
  WHERE id = p_ingredient_id AND tenant_id = p_tenant_id;

  INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, notes)
  VALUES (p_tenant_id, p_ingredient_id, 'opening', p_quantity, 'Stock d''ouverture');
END;
$$;


ALTER FUNCTION "public"."set_opening_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_trial_end_date"() RETURNS "trigger"
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


CREATE OR REPLACE FUNCTION "public"."unclaim_coupon_usage"("p_coupon_id" "uuid") RETURNS "void"
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


CREATE OR REPLACE FUNCTION "public"."update_ingredients_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_ingredients_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_menus_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_menus_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_suppliers_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_suppliers_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_tenant_supports_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin new.updated_at = now(); return new; end; $$;


ALTER FUNCTION "public"."update_tenant_supports_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_preferences_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_user_preferences_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_users" (
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


CREATE TABLE IF NOT EXISTS "public"."ads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "image_url" "text" NOT NULL,
    "link" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_credits_ledger" (
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


CREATE TABLE IF NOT EXISTS "public"."ai_photo_credits" (
    "tenant_id" "uuid" NOT NULL,
    "balance" integer DEFAULT 0 NOT NULL,
    "monthly_grant" integer DEFAULT 0 NOT NULL,
    "last_grant_at" timestamp with time zone,
    "lifetime_used" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ai_photo_credits_balance_check" CHECK (("balance" >= 0))
);


ALTER TABLE "public"."ai_photo_credits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcements" (
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


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
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


CREATE TABLE IF NOT EXISTS "public"."categories" (
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
    CONSTRAINT "categories_preparation_zone_check" CHECK (("preparation_zone" = ANY (ARRAY['kitchen'::"text", 'bar'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


COMMENT ON COLUMN "public"."categories"."is_featured_on_home" IS 'When TRUE, this category is displayed in the client home shortcut grid. Restaurateurs pick explicitly which categories to highlight.';



CREATE TABLE IF NOT EXISTS "public"."coupons" (
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


CREATE TABLE IF NOT EXISTS "public"."dish_photo_drafts" (
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


CREATE TABLE IF NOT EXISTS "public"."ingredients" (
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
    CONSTRAINT "ingredients_unit_check" CHECK (("unit" = ANY (ARRAY['kg'::"text", 'L'::"text", 'pièce'::"text", 'cl'::"text", 'g'::"text", 'bouteille'::"text"])))
);


ALTER TABLE "public"."ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invitations" (
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


CREATE TABLE IF NOT EXISTS "public"."item_modifiers" (
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


CREATE TABLE IF NOT EXISTS "public"."item_options" (
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


CREATE TABLE IF NOT EXISTS "public"."item_price_variants" (
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


CREATE TABLE IF NOT EXISTS "public"."item_suggestions" (
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


CREATE TABLE IF NOT EXISTS "public"."menu_items" (
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
    CONSTRAINT "menu_items_favorite_count_check" CHECK (("favorite_count" >= 0)),
    CONSTRAINT "menu_items_image_source_check" CHECK (("image_source" = ANY (ARRAY['web'::"text", 'at_food_ios'::"text", 'import'::"text", 'ai_generated'::"text"]))),
    CONSTRAINT "menu_items_rating_check" CHECK ((("rating" IS NULL) OR (("rating" >= (0)::numeric) AND ("rating" <= (5)::numeric)))),
    CONSTRAINT "menu_items_rating_count_check" CHECK (("rating_count" >= 0))
);


ALTER TABLE "public"."menu_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menus" (
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


COMMENT ON COLUMN "public"."menus"."is_transversal_menu" IS 'When TRUE, this menu (carte) is exposed as a sub-tab on every other top-level menu in the client UI.';



CREATE TABLE IF NOT EXISTS "public"."newsletter_subscriber" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."newsletter_subscriber" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
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


CREATE TABLE IF NOT EXISTS "public"."onboarding_progress" (
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


CREATE TABLE IF NOT EXISTS "public"."orange_money_events" (
    "id" "text" NOT NULL,
    "status" "text" NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."orange_money_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."orange_money_events" IS 'Idempotency log for Orange Money callback events. INSERT ON CONFLICT detects replays.';



CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "price_at_order" numeric(10,2) NOT NULL,
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
    CONSTRAINT "order_items_course_check" CHECK ((("course" IS NULL) OR (("course")::"text" = ANY ((ARRAY['appetizer'::character varying, 'main'::character varying, 'dessert'::character varying, 'drink'::character varying])::"text"[])))),
    CONSTRAINT "order_items_item_status_check" CHECK ((("item_status")::"text" = ANY ((ARRAY['pending'::character varying, 'preparing'::character varying, 'ready'::character varying, 'served'::character varying])::"text"[]))),
    CONSTRAINT "order_items_preparation_zone_check" CHECK (("preparation_zone" = ANY (ARRAY['kitchen'::"text", 'bar'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."order_items"."preparation_zone" IS 'Preparation zone copied from the item category at order time: kitchen, bar, or both';



CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "venue_id" "uuid",
    "order_number" "text" NOT NULL,
    "table_number" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "subtotal" numeric(10,2) NOT NULL,
    "tax" numeric(10,2) DEFAULT 0 NOT NULL,
    "total" numeric(10,2) NOT NULL,
    "customer_name" "text",
    "customer_phone" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "service_type" character varying(20) DEFAULT 'dine_in'::character varying,
    "room_number" character varying(20),
    "delivery_address" "text",
    "tax_amount" numeric(10,2) DEFAULT 0,
    "service_charge_amount" numeric(10,2) DEFAULT 0,
    "discount_amount" numeric(10,2) DEFAULT 0,
    "payment_method" character varying(20),
    "payment_status" character varying(20) DEFAULT 'pending'::character varying,
    "paid_at" timestamp with time zone,
    "coupon_id" "uuid",
    "assigned_to" "uuid",
    "cashier_id" "uuid",
    "server_id" "uuid",
    "display_currency" character varying(3) DEFAULT NULL::character varying,
    "tip_amount" numeric DEFAULT 0,
    "preparation_zone" "text" DEFAULT 'kitchen'::"text" NOT NULL,
    "orange_money_pay_token" "text",
    "orange_money_notif_token" "text",
    "wave_checkout_id" "text",
    "payment_initiated_at" timestamp with time zone,
    "table_id" "uuid",
    CONSTRAINT "orders_payment_method_check" CHECK ((("payment_method")::"text" = ANY ((ARRAY['cash'::character varying, 'card'::character varying, 'wave'::character varying, 'orange_money'::character varying, 'mtn_momo'::character varying, 'free_money'::character varying])::"text"[]))),
    CONSTRAINT "orders_payment_status_check" CHECK ((("payment_status")::"text" = ANY ((ARRAY['pending'::character varying, 'paid'::character varying, 'refunded'::character varying])::"text"[]))),
    CONSTRAINT "orders_preparation_zone_check" CHECK (("preparation_zone" = ANY (ARRAY['kitchen'::"text", 'bar'::"text", 'mixed'::"text"]))),
    CONSTRAINT "orders_service_type_check" CHECK ((("service_type")::"text" = ANY ((ARRAY['dine_in'::character varying, 'takeaway'::character varying, 'delivery'::character varying, 'room_service'::character varying])::"text"[]))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'preparing'::"text", 'ready'::"text", 'delivered'::"text", 'served'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."orders"."tip_amount" IS 'Tip/pourboire amount in base currency (XAF)';



CREATE TABLE IF NOT EXISTS "public"."platform_audit_log" (
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


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipes" (
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


CREATE TABLE IF NOT EXISTS "public"."restaurant_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'Mon Groupe'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."restaurant_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "permissions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "role_permissions_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'manager'::"text", 'cashier'::"text", 'chef'::"text", 'waiter'::"text"])))
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_alert_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "alert_type" "text" NOT NULL,
    "sent_to" "text"[] NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stock_alert_notifications_alert_type_check" CHECK (("alert_type" = ANY (ARRAY['low_stock'::"text", 'out_of_stock'::"text"])))
);


ALTER TABLE "public"."stock_alert_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_movements" (
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
    CONSTRAINT "stock_movements_movement_type_check" CHECK (("movement_type" = ANY (ARRAY['order_destock'::"text", 'manual_add'::"text", 'manual_remove'::"text", 'adjustment'::"text", 'opening'::"text"])))
);


ALTER TABLE "public"."stock_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stripe_events" (
    "id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "stripe_created_at" timestamp with time zone,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stripe_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."stripe_events" IS 'Idempotency log for Stripe webhook events. INSERT ON CONFLICT is used
     at the start of every webhook handler to detect replayed events.';



CREATE TABLE IF NOT EXISTS "public"."suppliers" (
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


CREATE TABLE IF NOT EXISTS "public"."table_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "table_id" "uuid" NOT NULL,
    "server_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."table_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "zone_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "table_number" character varying(20) NOT NULL,
    "display_name" character varying(100) NOT NULL,
    "capacity" integer DEFAULT 2 NOT NULL,
    "is_active" boolean DEFAULT true,
    "qr_code_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "tables_capacity_check" CHECK (("capacity" > 0))
);


ALTER TABLE "public"."tables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_supports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "type" "text" DEFAULT 'chevalet_standard'::"text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenant_supports_type_check" CHECK (("type" = 'chevalet_standard'::"text"))
);


ALTER TABLE "public"."tenant_supports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenants" (
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
    CONSTRAINT "tenants_billing_interval_check" CHECK (("billing_interval" = ANY (ARRAY['monthly'::"text", 'semiannual'::"text", 'yearly'::"text"]))),
    CONSTRAINT "tenants_currency_check" CHECK ((("currency")::"text" = ANY ((ARRAY['XAF'::character varying, 'XOF'::character varying, 'EUR'::character varying, 'USD'::character varying])::"text"[]))),
    CONSTRAINT "tenants_screen_lock_mode_check" CHECK (("screen_lock_mode" = ANY (ARRAY['overlay'::"text", 'password'::"text"]))),
    CONSTRAINT "tenants_service_charge_rate_check" CHECK ((("service_charge_rate" >= (0)::numeric) AND ("service_charge_rate" <= (100)::numeric))),
    CONSTRAINT "tenants_subscription_status_check" CHECK (("subscription_status" = ANY (ARRAY['trial'::"text", 'active'::"text", 'past_due'::"text", 'cancelled'::"text", 'paused'::"text", 'frozen'::"text"]))),
    CONSTRAINT "tenants_tax_rate_check" CHECK ((("tax_rate" >= (0)::numeric) AND ("tax_rate" <= (100)::numeric)))
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";


COMMENT ON COLUMN "public"."tenants"."idle_timeout_minutes" IS 'Minutes of inactivity before lock screen. NULL = disabled. Range: 5-120.';



COMMENT ON COLUMN "public"."tenants"."screen_lock_mode" IS 'overlay = simple click-to-unlock, password = requires re-authentication';



COMMENT ON COLUMN "public"."tenants"."default_locale" IS 'Default locale for the tenant dashboard and client-facing pages. One of: fr-FR, fr-CA, en-US, en-GB, en-AU, en-CA, en-IE, es-ES.';



COMMENT ON COLUMN "public"."tenants"."opening_hours" IS 'Weekly opening hours as { mon: {open,close}, ... }. Empty object = always open.';



CREATE TABLE IF NOT EXISTS "public"."user_preferences" (
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


CREATE TABLE IF NOT EXISTS "public"."user_sessions" (
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


CREATE TABLE IF NOT EXISTS "public"."venues" (
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


CREATE TABLE IF NOT EXISTS "public"."wave_events" (
    "id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "wave_created_at" timestamp with time zone,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wave_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."wave_events" IS 'Idempotency log for Wave webhook events. INSERT ON CONFLICT detects replays.';



CREATE TABLE IF NOT EXISTS "public"."zones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "venue_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "name_en" "text",
    "prefix" character varying(10) NOT NULL,
    "description" "text",
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."zones" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ads"
    ADD CONSTRAINT "ads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_credits_ledger"
    ADD CONSTRAINT "ai_credits_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_photo_credits"
    ADD CONSTRAINT "ai_photo_credits_pkey" PRIMARY KEY ("tenant_id");



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_tenant_id_code_key" UNIQUE ("tenant_id", "code");



ALTER TABLE ONLY "public"."dish_photo_drafts"
    ADD CONSTRAINT "dish_photo_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."item_modifiers"
    ADD CONSTRAINT "item_modifiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."item_options"
    ADD CONSTRAINT "item_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."item_price_variants"
    ADD CONSTRAINT "item_price_variants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."item_suggestions"
    ADD CONSTRAINT "item_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_tenant_id_slug_key" UNIQUE ("tenant_id", "slug");



ALTER TABLE ONLY "public"."newsletter_subscriber"
    ADD CONSTRAINT "newsletter_subscriber_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."newsletter_subscriber"
    ADD CONSTRAINT "newsletter_subscriber_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_progress"
    ADD CONSTRAINT "onboarding_progress_pkey" PRIMARY KEY ("tenant_id");



ALTER TABLE ONLY "public"."orange_money_events"
    ADD CONSTRAINT "orange_money_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_audit_log"
    ADD CONSTRAINT "platform_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_menu_item_id_ingredient_id_key" UNIQUE ("menu_item_id", "ingredient_id");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_groups"
    ADD CONSTRAINT "restaurant_groups_owner_unique" UNIQUE ("owner_user_id");



ALTER TABLE ONLY "public"."restaurant_groups"
    ADD CONSTRAINT "restaurant_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_unique" UNIQUE ("tenant_id", "role");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_alert_notifications"
    ADD CONSTRAINT "stock_alert_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_events"
    ADD CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."table_assignments"
    ADD CONSTRAINT "table_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_supports"
    ADD CONSTRAINT "tenant_supports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_supports"
    ADD CONSTRAINT "tenant_supports_unique" UNIQUE ("tenant_id", "type");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_custom_domain_key" UNIQUE ("custom_domain");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_stripe_customer_id_key" UNIQUE ("stripe_customer_id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."venues"
    ADD CONSTRAINT "venues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wave_events"
    ADD CONSTRAINT "wave_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zones"
    ADD CONSTRAINT "zones_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_admin_users_created_by" ON "public"."admin_users" USING "btree" ("created_by");



CREATE UNIQUE INDEX "idx_admin_users_email_tenant" ON "public"."admin_users" USING "btree" ("tenant_id", "email");



CREATE INDEX "idx_admin_users_live" ON "public"."admin_users" USING "btree" ("tenant_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_admin_users_tenant" ON "public"."admin_users" USING "btree" ("tenant_id");



CREATE INDEX "idx_admin_users_user_id" ON "public"."admin_users" USING "btree" ("user_id");



CREATE INDEX "idx_ads_tenant_active" ON "public"."ads" USING "btree" ("tenant_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_ads_tenant_id" ON "public"."ads" USING "btree" ("tenant_id");



CREATE INDEX "idx_announcements_active" ON "public"."announcements" USING "btree" ("tenant_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_announcements_tenant" ON "public"."announcements" USING "btree" ("tenant_id");



CREATE INDEX "idx_announcements_tenant_active" ON "public"."announcements" USING "btree" ("tenant_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_announcements_tenant_id" ON "public"."announcements" USING "btree" ("tenant_id");



CREATE INDEX "idx_audit_log_entity" ON "public"."audit_log" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_audit_log_tenant" ON "public"."audit_log" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_audit_log_user" ON "public"."audit_log" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_categories_featured_on_home" ON "public"."categories" USING "btree" ("tenant_id") WHERE ("is_featured_on_home" = true);



CREATE INDEX "idx_categories_menu" ON "public"."categories" USING "btree" ("menu_id");



CREATE INDEX "idx_categories_tenant" ON "public"."categories" USING "btree" ("tenant_id");



CREATE INDEX "idx_categories_venue" ON "public"."categories" USING "btree" ("venue_id");



CREATE INDEX "idx_coupons_code" ON "public"."coupons" USING "btree" ("code") WHERE ("is_active" = true);



CREATE INDEX "idx_coupons_tenant" ON "public"."coupons" USING "btree" ("tenant_id");



CREATE INDEX "idx_coupons_validation" ON "public"."coupons" USING "btree" ("tenant_id", "code", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_dish_photo_drafts_tenant" ON "public"."dish_photo_drafts" USING "btree" ("tenant_id", "status");



CREATE INDEX "idx_ingredients_active" ON "public"."ingredients" USING "btree" ("tenant_id", "is_active");



CREATE INDEX "idx_ingredients_stock_alert" ON "public"."ingredients" USING "btree" ("tenant_id", "is_active", "current_stock", "min_stock_alert") WHERE ("is_active" = true);



CREATE INDEX "idx_ingredients_tenant" ON "public"."ingredients" USING "btree" ("tenant_id");



CREATE INDEX "idx_invitations_email" ON "public"."invitations" USING "btree" ("email");



CREATE INDEX "idx_invitations_tenant" ON "public"."invitations" USING "btree" ("tenant_id");



CREATE INDEX "idx_invitations_token" ON "public"."invitations" USING "btree" ("token");



CREATE INDEX "idx_ipv_menu_item" ON "public"."item_price_variants" USING "btree" ("menu_item_id");



CREATE INDEX "idx_ipv_tenant" ON "public"."item_price_variants" USING "btree" ("tenant_id");



CREATE INDEX "idx_item_modifiers_menu_item" ON "public"."item_modifiers" USING "btree" ("menu_item_id");



CREATE INDEX "idx_item_modifiers_tenant" ON "public"."item_modifiers" USING "btree" ("tenant_id");



CREATE INDEX "idx_item_options_menu_item" ON "public"."item_options" USING "btree" ("menu_item_id");



CREATE INDEX "idx_item_options_tenant" ON "public"."item_options" USING "btree" ("tenant_id");



CREATE INDEX "idx_item_suggestions_item" ON "public"."item_suggestions" USING "btree" ("menu_item_id");



CREATE INDEX "idx_item_suggestions_suggested_item_id" ON "public"."item_suggestions" USING "btree" ("suggested_item_id");



CREATE INDEX "idx_item_suggestions_tenant" ON "public"."item_suggestions" USING "btree" ("tenant_id");



CREATE INDEX "idx_menu_items_active" ON "public"."menu_items" USING "btree" ("tenant_id", "category_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_menu_items_category" ON "public"."menu_items" USING "btree" ("category_id");



CREATE INDEX "idx_menu_items_tenant" ON "public"."menu_items" USING "btree" ("tenant_id");



CREATE INDEX "idx_menu_items_tenant_category" ON "public"."menu_items" USING "btree" ("tenant_id", "category_id");



CREATE INDEX "idx_menus_active" ON "public"."menus" USING "btree" ("tenant_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_menus_parent" ON "public"."menus" USING "btree" ("parent_menu_id");



CREATE INDEX "idx_menus_slug" ON "public"."menus" USING "btree" ("tenant_id", "slug");



CREATE INDEX "idx_menus_tenant" ON "public"."menus" USING "btree" ("tenant_id");



CREATE INDEX "idx_menus_transversal" ON "public"."menus" USING "btree" ("tenant_id") WHERE ("is_transversal_menu" = true);



CREATE INDEX "idx_menus_venue" ON "public"."menus" USING "btree" ("venue_id");



CREATE INDEX "idx_notifications_tenant_broadcast" ON "public"."notifications" USING "btree" ("tenant_id", "created_at" DESC) WHERE ("user_id" IS NULL);



CREATE INDEX "idx_notifications_tenant_user" ON "public"."notifications" USING "btree" ("tenant_id", "user_id", "read", "created_at" DESC);



CREATE INDEX "idx_onboarding_progress_tenant" ON "public"."onboarding_progress" USING "btree" ("tenant_id");



CREATE INDEX "idx_order_items_course" ON "public"."order_items" USING "btree" ("order_id", "course");



CREATE INDEX "idx_order_items_menu_item" ON "public"."order_items" USING "btree" ("menu_item_id");



CREATE INDEX "idx_order_items_order" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_order_items_status" ON "public"."order_items" USING "btree" ("order_id", "item_status");



CREATE INDEX "idx_orders_assigned" ON "public"."orders" USING "btree" ("assigned_to");



CREATE INDEX "idx_orders_cashier" ON "public"."orders" USING "btree" ("cashier_id");



CREATE INDEX "idx_orders_coupon_id" ON "public"."orders" USING "btree" ("coupon_id") WHERE ("coupon_id" IS NOT NULL);



CREATE INDEX "idx_orders_created_at" ON "public"."orders" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "idx_orders_number_tenant" ON "public"."orders" USING "btree" ("tenant_id", "order_number");



CREATE INDEX "idx_orders_orange_pay_token" ON "public"."orders" USING "btree" ("orange_money_pay_token") WHERE ("orange_money_pay_token" IS NOT NULL);



CREATE INDEX "idx_orders_payment_status" ON "public"."orders" USING "btree" ("tenant_id", "payment_status");



CREATE INDEX "idx_orders_server" ON "public"."orders" USING "btree" ("server_id");



CREATE INDEX "idx_orders_service_type" ON "public"."orders" USING "btree" ("tenant_id", "service_type");



CREATE INDEX "idx_orders_stale_payment_sessions" ON "public"."orders" USING "btree" ("payment_initiated_at") WHERE ((("payment_status")::"text" = 'pending'::"text") AND ("payment_initiated_at" IS NOT NULL) AND (("wave_checkout_id" IS NOT NULL) OR ("orange_money_pay_token" IS NOT NULL)));



CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "idx_orders_table_id" ON "public"."orders" USING "btree" ("table_id") WHERE ("table_id" IS NOT NULL);



CREATE INDEX "idx_orders_tenant" ON "public"."orders" USING "btree" ("tenant_id");



CREATE INDEX "idx_orders_tenant_order_number" ON "public"."orders" USING "btree" ("tenant_id", "order_number" "text_pattern_ops");



CREATE INDEX "idx_orders_tenant_prep_zone" ON "public"."orders" USING "btree" ("tenant_id", "preparation_zone", "status") WHERE ("status" = ANY (ARRAY['pending'::"text", 'preparing'::"text", 'ready'::"text"]));



CREATE INDEX "idx_orders_tenant_status" ON "public"."orders" USING "btree" ("tenant_id", "status");



CREATE INDEX "idx_orders_tenant_status_created" ON "public"."orders" USING "btree" ("tenant_id", "status", "created_at" DESC);



CREATE INDEX "idx_orders_venue" ON "public"."orders" USING "btree" ("venue_id");



CREATE INDEX "idx_orders_venue_status" ON "public"."orders" USING "btree" ("venue_id", "status", "created_at" DESC);



CREATE INDEX "idx_orders_wave_checkout_id" ON "public"."orders" USING "btree" ("wave_checkout_id") WHERE ("wave_checkout_id" IS NOT NULL);



CREATE INDEX "idx_platform_audit_log_created" ON "public"."platform_audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_platform_audit_log_target" ON "public"."platform_audit_log" USING "btree" ("target_type", "target_id");



CREATE INDEX "idx_push_subscriptions_tenant" ON "public"."push_subscriptions" USING "btree" ("tenant_id");



CREATE INDEX "idx_push_subscriptions_user" ON "public"."push_subscriptions" USING "btree" ("user_id");



CREATE INDEX "idx_recipes_ingredient" ON "public"."recipes" USING "btree" ("ingredient_id");



CREATE INDEX "idx_recipes_menu_item" ON "public"."recipes" USING "btree" ("menu_item_id");



CREATE INDEX "idx_recipes_tenant" ON "public"."recipes" USING "btree" ("tenant_id");



CREATE INDEX "idx_restaurant_groups_owner" ON "public"."restaurant_groups" USING "btree" ("owner_user_id");



CREATE UNIQUE INDEX "idx_settings_key_tenant" ON "public"."settings" USING "btree" ("tenant_id", "key");



CREATE INDEX "idx_stock_alerts_rate_limit" ON "public"."stock_alert_notifications" USING "btree" ("tenant_id", "ingredient_id", "sent_at" DESC);



CREATE INDEX "idx_stock_movements_date" ON "public"."stock_movements" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_stock_movements_ingredient" ON "public"."stock_movements" USING "btree" ("ingredient_id");



CREATE INDEX "idx_stock_movements_supplier" ON "public"."stock_movements" USING "btree" ("supplier_id") WHERE ("supplier_id" IS NOT NULL);



CREATE INDEX "idx_stock_movements_tenant" ON "public"."stock_movements" USING "btree" ("tenant_id");



CREATE INDEX "idx_stock_movements_tenant_created" ON "public"."stock_movements" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_stock_movements_type" ON "public"."stock_movements" USING "btree" ("tenant_id", "movement_type");



CREATE INDEX "idx_suppliers_active" ON "public"."suppliers" USING "btree" ("tenant_id", "is_active");



CREATE INDEX "idx_suppliers_tenant" ON "public"."suppliers" USING "btree" ("tenant_id");



CREATE INDEX "idx_table_assignments_active" ON "public"."table_assignments" USING "btree" ("tenant_id", "table_id") WHERE ("ended_at" IS NULL);



CREATE INDEX "idx_table_assignments_server" ON "public"."table_assignments" USING "btree" ("server_id") WHERE ("ended_at" IS NULL);



CREATE INDEX "idx_table_assignments_tenant" ON "public"."table_assignments" USING "btree" ("tenant_id");



CREATE INDEX "idx_tables_active" ON "public"."tables" USING "btree" ("tenant_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_tables_tenant" ON "public"."tables" USING "btree" ("tenant_id");



CREATE INDEX "idx_tables_zone" ON "public"."tables" USING "btree" ("zone_id");



CREATE INDEX "idx_tenants_custom_domain" ON "public"."tenants" USING "btree" ("custom_domain") WHERE ("custom_domain" IS NOT NULL);



CREATE INDEX "idx_tenants_group_id" ON "public"."tenants" USING "btree" ("group_id");



CREATE INDEX "idx_tenants_live" ON "public"."tenants" USING "btree" ("slug") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_tenants_onboarding" ON "public"."tenants" USING "btree" ("onboarding_completed");



CREATE INDEX "idx_tenants_slug" ON "public"."tenants" USING "btree" ("slug");



CREATE INDEX "idx_tenants_stripe_customer" ON "public"."tenants" USING "btree" ("stripe_customer_id");



CREATE INDEX "idx_tenants_stripe_customer_id" ON "public"."tenants" USING "btree" ("stripe_customer_id");



CREATE INDEX "idx_tenants_subscription_status" ON "public"."tenants" USING "btree" ("subscription_status");



CREATE INDEX "idx_tenants_trial_ends_at" ON "public"."tenants" USING "btree" ("trial_ends_at") WHERE ("subscription_status" = 'trial'::"text");



CREATE INDEX "idx_user_preferences_user" ON "public"."user_preferences" USING "btree" ("user_id");



CREATE INDEX "idx_user_sessions_login_at" ON "public"."user_sessions" USING "btree" ("login_at");



CREATE INDEX "idx_user_sessions_tenant" ON "public"."user_sessions" USING "btree" ("tenant_id");



CREATE INDEX "idx_user_sessions_user" ON "public"."user_sessions" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_venues_slug_tenant" ON "public"."venues" USING "btree" ("tenant_id", "slug");



CREATE INDEX "idx_venues_tenant" ON "public"."venues" USING "btree" ("tenant_id");



CREATE INDEX "idx_zones_tenant" ON "public"."zones" USING "btree" ("tenant_id");



CREATE INDEX "idx_zones_venue" ON "public"."zones" USING "btree" ("venue_id");



CREATE INDEX "orange_money_events_processed_at_idx" ON "public"."orange_money_events" USING "btree" ("processed_at" DESC);



CREATE INDEX "stripe_events_processed_at_idx" ON "public"."stripe_events" USING "btree" ("processed_at" DESC);



CREATE INDEX "tenant_supports_tenant_id_idx" ON "public"."tenant_supports" USING "btree" ("tenant_id");



CREATE INDEX "wave_events_processed_at_idx" ON "public"."wave_events" USING "btree" ("processed_at" DESC);



CREATE OR REPLACE TRIGGER "prevent_super_admin_elevation_trg" BEFORE INSERT OR UPDATE ON "public"."admin_users" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_super_admin_elevation"();



CREATE OR REPLACE TRIGGER "tenant_supports_updated_at" BEFORE UPDATE ON "public"."tenant_supports" FOR EACH ROW EXECUTE FUNCTION "public"."update_tenant_supports_updated_at"();



CREATE OR REPLACE TRIGGER "trg_broadcast_order_status" AFTER UPDATE OF "status" ON "public"."orders" FOR EACH ROW WHEN (("old"."status" IS DISTINCT FROM "new"."status")) EXECUTE FUNCTION "public"."broadcast_order_status"();



CREATE OR REPLACE TRIGGER "trigger_auto_create_user_preferences" AFTER INSERT ON "public"."admin_users" FOR EACH ROW EXECUTE FUNCTION "public"."auto_create_user_preferences"();



CREATE OR REPLACE TRIGGER "trigger_ingredients_updated_at" BEFORE UPDATE ON "public"."ingredients" FOR EACH ROW EXECUTE FUNCTION "public"."update_ingredients_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_menus_updated_at" BEFORE UPDATE ON "public"."menus" FOR EACH ROW EXECUTE FUNCTION "public"."update_menus_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_set_trial_end_date" BEFORE INSERT OR UPDATE ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."set_trial_end_date"();



CREATE OR REPLACE TRIGGER "trigger_suppliers_updated_at" BEFORE UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."update_suppliers_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_user_preferences_updated_at" BEFORE UPDATE ON "public"."user_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_preferences_updated_at"();



CREATE OR REPLACE TRIGGER "update_menu_items_updated_at" BEFORE UPDATE ON "public"."menu_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_tenants_updated_at" BEFORE UPDATE ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_banned_by_fkey" FOREIGN KEY ("banned_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ads"
    ADD CONSTRAINT "ads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_credits_ledger"
    ADD CONSTRAINT "ai_credits_ledger_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_credits_ledger"
    ADD CONSTRAINT "ai_credits_ledger_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_credits_ledger"
    ADD CONSTRAINT "ai_credits_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ai_photo_credits"
    ADD CONSTRAINT "ai_photo_credits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dish_photo_drafts"
    ADD CONSTRAINT "dish_photo_drafts_attached_menu_item_id_fkey" FOREIGN KEY ("attached_menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dish_photo_drafts"
    ADD CONSTRAINT "dish_photo_drafts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."dish_photo_drafts"
    ADD CONSTRAINT "dish_photo_drafts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."admin_users"("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_modifiers"
    ADD CONSTRAINT "item_modifiers_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_modifiers"
    ADD CONSTRAINT "item_modifiers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_options"
    ADD CONSTRAINT "item_options_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_options"
    ADD CONSTRAINT "item_options_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_price_variants"
    ADD CONSTRAINT "item_price_variants_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_price_variants"
    ADD CONSTRAINT "item_price_variants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_suggestions"
    ADD CONSTRAINT "item_suggestions_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_suggestions"
    ADD CONSTRAINT "item_suggestions_suggested_item_id_fkey" FOREIGN KEY ("suggested_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_suggestions"
    ADD CONSTRAINT "item_suggestions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_image_uploaded_by_fkey" FOREIGN KEY ("image_uploaded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_parent_menu_id_fkey" FOREIGN KEY ("parent_menu_id") REFERENCES "public"."menus"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_progress"
    ADD CONSTRAINT "onboarding_progress_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."platform_audit_log"
    ADD CONSTRAINT "platform_audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."platform_audit_log"
    ADD CONSTRAINT "platform_audit_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_groups"
    ADD CONSTRAINT "restaurant_groups_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."admin_users"("id");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_alert_notifications"
    ADD CONSTRAINT "stock_alert_notifications_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_alert_notifications"
    ADD CONSTRAINT "stock_alert_notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."table_assignments"
    ADD CONSTRAINT "table_assignments_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."admin_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."table_assignments"
    ADD CONSTRAINT "table_assignments_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."table_assignments"
    ADD CONSTRAINT "table_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_supports"
    ADD CONSTRAINT "tenant_supports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."restaurant_groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_suspended_by_fkey" FOREIGN KEY ("suspended_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."venues"
    ADD CONSTRAINT "venues_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zones"
    ADD CONSTRAINT "zones_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zones"
    ADD CONSTRAINT "zones_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can delete own tenant ads" ON "public"."ads" FOR DELETE USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can delete own tenant announcements" ON "public"."announcements" FOR DELETE USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can delete own tenant order items" ON "public"."order_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))))));



CREATE POLICY "Admins can delete their restaurant orders" ON "public"."orders" FOR DELETE USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can insert audit logs" ON "public"."audit_log" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "Admins can insert notifications" ON "public"."notifications" FOR INSERT WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can insert own tenant order items" ON "public"."order_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))))));



CREATE POLICY "Admins can manage announcements" ON "public"."announcements" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Admins can manage own tenant admins" ON "public"."admin_users" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can manage own tenant ads" ON "public"."ads" FOR INSERT WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can manage own tenant announcements" ON "public"."announcements" FOR INSERT WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can manage own tenant categories" ON "public"."categories" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can manage own tenant coupons" ON "public"."coupons" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can manage own tenant ingredients" ON "public"."ingredients" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can manage own tenant item_suggestions" ON "public"."item_suggestions" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can manage own tenant menu items" ON "public"."menu_items" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can manage own tenant menus" ON "public"."menus" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can manage own tenant orders" ON "public"."orders" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can manage own tenant recipes" ON "public"."recipes" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can manage own tenant stock_movements" ON "public"."stock_movements" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can manage own tenant suppliers" ON "public"."suppliers" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can manage own tenant venues" ON "public"."venues" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can manage price variants" ON "public"."item_price_variants" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can manage tables" ON "public"."tables" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Admins can manage their restaurant orders" ON "public"."orders" FOR UPDATE USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can manage their restaurant settings" ON "public"."settings" USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"())))) WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "Admins can manage zones" ON "public"."zones" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Admins can read audit logs" ON "public"."audit_log" FOR SELECT USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = "auth"."uid"()) AND ("admin_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Admins can read own notifications" ON "public"."notifications" FOR SELECT USING ((("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))) AND (("user_id" = "auth"."uid"()) OR ("user_id" IS NULL))));



CREATE POLICY "Admins can update own notifications" ON "public"."notifications" FOR UPDATE USING ((("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))) AND (("user_id" = "auth"."uid"()) OR ("user_id" IS NULL)))) WITH CHECK ((("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))) AND (("user_id" = "auth"."uid"()) OR ("user_id" IS NULL))));



CREATE POLICY "Admins can update own tenant" ON "public"."tenants" FOR UPDATE USING (("id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can update own tenant ads" ON "public"."ads" FOR UPDATE USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can update own tenant announcements" ON "public"."announcements" FOR UPDATE USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can update own tenant order items" ON "public"."order_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = ANY ("public"."get_my_tenant_ids_array"())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))))));



CREATE POLICY "Admins can view own tenant admins" ON "public"."admin_users" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR ("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))));



CREATE POLICY "Admins can view own tenant ingredients" ON "public"."ingredients" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can view own tenant item_suggestions" ON "public"."item_suggestions" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can view own tenant order items" ON "public"."order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))))));



CREATE POLICY "Admins can view own tenant orders" ON "public"."orders" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can view own tenant recipes" ON "public"."recipes" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can view own tenant stock_movements" ON "public"."stock_movements" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins can view own tenant suppliers" ON "public"."suppliers" FOR SELECT USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins manage item options" ON "public"."item_options" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins manage own tenant drafts" ON "public"."dish_photo_drafts" USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = "auth"."uid"()) AND ("admin_users"."is_active" = true) AND ("admin_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"])))))) WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = "auth"."uid"()) AND ("admin_users"."is_active" = true) AND ("admin_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Admins manage own tenant item options" ON "public"."item_options" TO "authenticated" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins manage own tenant price variants" ON "public"."item_price_variants" TO "authenticated" USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "Admins read own credits" ON "public"."ai_photo_credits" FOR SELECT USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = "auth"."uid"()) AND ("admin_users"."is_active" = true)))));



CREATE POLICY "Admins read own ledger" ON "public"."ai_credits_ledger" FOR SELECT USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = "auth"."uid"()) AND ("admin_users"."is_active" = true)))));



CREATE POLICY "Anyone can view active ads" ON "public"."ads" FOR SELECT USING (true);



CREATE POLICY "Anyone can view active announcements" ON "public"."announcements" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can read tenants they belong to" ON "public"."tenants" FOR SELECT USING (("id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "Block super_admin escalation by non-super-admins" ON "public"."admin_users" AS RESTRICTIVE USING ((((COALESCE("is_super_admin", false) = false) AND ("role" IS DISTINCT FROM 'super_admin'::"text")) OR "public"."is_super_admin"())) WITH CHECK ((((COALESCE("is_super_admin", false) = false) AND ("role" IS DISTINCT FROM 'super_admin'::"text")) OR "public"."is_super_admin"()));



CREATE POLICY "Categories are publicly readable" ON "public"."categories" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Coupons manageable by admins" ON "public"."coupons" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Coupons viewable by tenant admins" ON "public"."coupons" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Enable delete for service_role only" ON "public"."newsletter_subscriber" FOR DELETE USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Enable insert for public" ON "public"."newsletter_subscriber" FOR INSERT WITH CHECK (true);



CREATE POLICY "Enable select for service_role only" ON "public"."newsletter_subscriber" FOR SELECT USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Item modifiers manageable by admins" ON "public"."item_modifiers" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Item modifiers viewable by anon for available items" ON "public"."item_modifiers" FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."menu_items" "mi"
  WHERE (("mi"."id" = "item_modifiers"."menu_item_id") AND ("mi"."is_available" = true) AND ("mi"."deleted_at" IS NULL)))));



CREATE POLICY "Item options viewable by anon for available items" ON "public"."item_options" FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."menu_items" "mi"
  WHERE (("mi"."id" = "item_options"."menu_item_id") AND ("mi"."is_available" = true) AND ("mi"."deleted_at" IS NULL)))));



CREATE POLICY "Menu items are publicly readable" ON "public"."menu_items" FOR SELECT USING (("is_available" = true));



CREATE POLICY "Price variants viewable by anon for available items" ON "public"."item_price_variants" FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."menu_items" "mi"
  WHERE (("mi"."id" = "item_price_variants"."menu_item_id") AND ("mi"."is_available" = true) AND ("mi"."deleted_at" IS NULL)))));



CREATE POLICY "Public can read active tenants" ON "public"."tenants" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Public can validate active coupons" ON "public"."coupons" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Public can view active announcements" ON "public"."announcements" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Public can view active menus" ON "public"."menus" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Public can view active tables" ON "public"."tables" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Public can view available menu items" ON "public"."menu_items" FOR SELECT USING ((("is_available" = true) AND ("deleted_at" IS NULL)));



CREATE POLICY "Public can view zones" ON "public"."zones" FOR SELECT USING (true);



CREATE POLICY "Service can read all push subscriptions" ON "public"."push_subscriptions" FOR SELECT USING (true);



CREATE POLICY "Tenant admins can view tenant sessions" ON "public"."user_sessions" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant members can delete assignments" ON "public"."table_assignments" FOR DELETE USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "Tenant members can insert assignments" ON "public"."table_assignments" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "Tenant members can update assignments" ON "public"."table_assignments" FOR UPDATE USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "Tenant members can view assignments" ON "public"."table_assignments" FOR SELECT USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can insert own onboarding_progress" ON "public"."onboarding_progress" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can insert own preferences" ON "public"."user_preferences" FOR INSERT WITH CHECK (("user_id" IN ( SELECT "admin_users"."id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can insert own sessions" ON "public"."user_sessions" FOR INSERT WITH CHECK (("user_id" IN ( SELECT "admin_users"."id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can manage own push subscriptions" ON "public"."push_subscriptions" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own onboarding_progress" ON "public"."onboarding_progress" FOR UPDATE USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"())))) WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can update own preferences" ON "public"."user_preferences" FOR UPDATE USING (("user_id" IN ( SELECT "admin_users"."id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"())))) WITH CHECK (("user_id" IN ( SELECT "admin_users"."id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view own onboarding_progress" ON "public"."onboarding_progress" FOR SELECT USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view own preferences" ON "public"."user_preferences" FOR SELECT USING ((("user_id" IN ( SELECT "admin_users"."id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))) OR ("user_id" IN ( SELECT "au"."id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))))));



CREATE POLICY "Users can view own sessions" ON "public"."user_sessions" FOR SELECT USING (("user_id" IN ( SELECT "admin_users"."id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "Venues are publicly readable" ON "public"."venues" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_credits_ledger" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_photo_credits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "atfood_insert_categories" ON "public"."categories" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = "auth"."uid"()) AND ("admin_users"."tenant_id" = "categories"."tenant_id") AND ("admin_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"])) AND (("admin_users"."is_active" IS NULL) OR ("admin_users"."is_active" = true))))));



CREATE POLICY "atfood_insert_menu_items" ON "public"."menu_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = "auth"."uid"()) AND ("admin_users"."tenant_id" = "menu_items"."tenant_id") AND ("admin_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"])) AND (("admin_users"."is_active" IS NULL) OR ("admin_users"."is_active" = true))))));



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coupons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dish_photo_drafts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_owner_can_read_tenants" ON "public"."tenants" FOR SELECT USING (("group_id" IN ( SELECT "restaurant_groups"."id"
   FROM "public"."restaurant_groups"
  WHERE ("restaurant_groups"."owner_user_id" = "auth"."uid"()))));



ALTER TABLE "public"."ingredients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ingredients_insert" ON "public"."ingredients" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = "auth"."uid"()))));



CREATE POLICY "ingredients_select" ON "public"."ingredients" FOR SELECT USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = "auth"."uid"()))));



CREATE POLICY "ingredients_update" ON "public"."ingredients" FOR UPDATE USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = "auth"."uid"())))) WITH CHECK (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."item_modifiers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."item_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."item_price_variants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."item_suggestions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "item_suggestions_delete" ON "public"."item_suggestions" FOR DELETE USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = "auth"."uid"()))));



CREATE POLICY "item_suggestions_insert" ON "public"."item_suggestions" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = "auth"."uid"()))));



CREATE POLICY "item_suggestions_select" ON "public"."item_suggestions" FOR SELECT USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = "auth"."uid"()))));



CREATE POLICY "item_suggestions_update" ON "public"."item_suggestions" FOR UPDATE USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = "auth"."uid"())))) WITH CHECK (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."menu_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."menus" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."newsletter_subscriber" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."onboarding_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orange_money_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orange_money_events_service_only" ON "public"."orange_money_events" AS RESTRICTIVE TO "authenticated", "anon" USING (false);



ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "owner_can_delete_own_group" ON "public"."restaurant_groups" FOR DELETE TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "owner_can_insert_own_group" ON "public"."restaurant_groups" FOR INSERT WITH CHECK (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "owner_can_manage_role_permissions" ON "public"."role_permissions" USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = "auth"."uid"()) AND ("admin_users"."role" = 'owner'::"text"))))) WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = "auth"."uid"()) AND ("admin_users"."role" = 'owner'::"text")))));



CREATE POLICY "owner_can_select_own_group" ON "public"."restaurant_groups" FOR SELECT USING (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "owner_can_update_own_group" ON "public"."restaurant_groups" FOR UPDATE USING (("owner_user_id" = "auth"."uid"()));



ALTER TABLE "public"."platform_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recipes_delete" ON "public"."recipes" FOR DELETE USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = "auth"."uid"()))));



CREATE POLICY "recipes_insert" ON "public"."recipes" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = "auth"."uid"()))));



CREATE POLICY "recipes_select" ON "public"."recipes" FOR SELECT USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = "auth"."uid"()))));



CREATE POLICY "recipes_update" ON "public"."recipes" FOR UPDATE USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = "auth"."uid"())))) WITH CHECK (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."restaurant_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_role_full_access" ON "public"."restaurant_groups" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_role_full_access_invitations" ON "public"."invitations" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_role_full_access_role_permissions" ON "public"."role_permissions" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_alert_notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_alert_notifications_delete" ON "public"."stock_alert_notifications" FOR DELETE USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "stock_alert_notifications_insert" ON "public"."stock_alert_notifications" FOR INSERT WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "stock_alert_notifications_update" ON "public"."stock_alert_notifications" FOR UPDATE USING (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))) WITH CHECK (("tenant_id" = ANY ("public"."get_my_tenant_ids_array"())));



CREATE POLICY "stock_alerts_select" ON "public"."stock_alert_notifications" FOR SELECT USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_movements_insert" ON "public"."stock_movements" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = "auth"."uid"()))));



CREATE POLICY "stock_movements_select" ON "public"."stock_movements" FOR SELECT USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."stripe_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "suppliers_delete" ON "public"."suppliers" FOR DELETE USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = "auth"."uid"()))));



CREATE POLICY "suppliers_insert" ON "public"."suppliers" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = "auth"."uid"()))));



CREATE POLICY "suppliers_select" ON "public"."suppliers" FOR SELECT USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = "auth"."uid"()))));



CREATE POLICY "suppliers_update" ON "public"."suppliers" FOR UPDATE USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = "auth"."uid"())))) WITH CHECK (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE ("au"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."table_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tables" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_admins_can_insert_invitations" ON "public"."invitations" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = "auth"."uid"()) AND ("admin_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "tenant_admins_can_update_invitations" ON "public"."invitations" FOR UPDATE USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = "auth"."uid"()) AND ("admin_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "tenant_admins_can_view_invitations" ON "public"."invitations" FOR SELECT USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = "auth"."uid"()) AND ("admin_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "tenant_members_can_view_role_permissions" ON "public"."role_permissions" FOR SELECT USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."tenant_supports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_supports_delete" ON "public"."tenant_supports" FOR DELETE USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "tenant_supports_insert" ON "public"."tenant_supports" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "tenant_supports_select" ON "public"."tenant_supports" FOR SELECT USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "tenant_supports_update" ON "public"."tenant_supports" FOR UPDATE USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"())))) WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."venues" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wave_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wave_events_service_only" ON "public"."wave_events" AS RESTRICTIVE TO "authenticated", "anon" USING (false);



ALTER TABLE "public"."zones" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."adjust_ingredient_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_delta" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_ingredient_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_delta" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_ingredient_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_delta" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."assert_tenant_member"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assert_tenant_member"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assert_tenant_member"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_create_user_preferences"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_create_user_preferences"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_create_user_preferences"() TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_order_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_order_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_order_status"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_activation_event"("p_tenant_id" "uuid", "p_event_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_activation_event"("p_tenant_id" "uuid", "p_event_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_coupon_usage"("p_coupon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_coupon_usage"("p_coupon_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_coupon_usage"("p_coupon_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_order_with_items"("p_tenant_id" "uuid", "p_order_number" "text", "p_total" numeric, "p_table_number" "text", "p_customer_name" "text", "p_customer_phone" "text", "p_notes" "text", "p_service_type" "text", "p_room_number" "text", "p_delivery_address" "text", "p_subtotal" numeric, "p_tax_amount" numeric, "p_service_charge_amount" numeric, "p_discount_amount" numeric, "p_tip_amount" numeric, "p_coupon_id" "uuid", "p_server_id" "uuid", "p_display_currency" "text", "p_preparation_zone" "text", "p_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_order_with_items"("p_tenant_id" "uuid", "p_order_number" "text", "p_total" numeric, "p_table_number" "text", "p_customer_name" "text", "p_customer_phone" "text", "p_notes" "text", "p_service_type" "text", "p_room_number" "text", "p_delivery_address" "text", "p_subtotal" numeric, "p_tax_amount" numeric, "p_service_charge_amount" numeric, "p_discount_amount" numeric, "p_tip_amount" numeric, "p_coupon_id" "uuid", "p_server_id" "uuid", "p_display_currency" "text", "p_preparation_zone" "text", "p_items" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_admin_user_atomic"("p_admin_user_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_admin_user_atomic"("p_admin_user_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."destock_order"("p_order_id" "uuid", "p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."destock_order"("p_order_id" "uuid", "p_tenant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."expire_stale_payment_sessions"("p_max_age_minutes" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_stale_payment_sessions"("p_max_age_minutes" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_menu_slug"("p_tenant_id" "uuid", "p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_menu_slug"("p_tenant_id" "uuid", "p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_menu_slug"("p_tenant_id" "uuid", "p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_co_ordered_items"("p_tenant_id" "uuid", "p_cart_ids" "uuid"[], "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_co_ordered_items"("p_tenant_id" "uuid", "p_cart_ids" "uuid"[], "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_co_ordered_items"("p_tenant_id" "uuid", "p_cart_ids" "uuid"[], "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_daily_revenue"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_daily_revenue"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_daily_revenue"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_tenant_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_tenant_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_tenant_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_tenant_ids_array"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_tenant_ids_array"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_tenant_ids_array"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_order_summary"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_order_summary"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_order_summary"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_orders_for_tracking"("p_tenant_id" "uuid", "p_order_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_orders_for_tracking"("p_tenant_id" "uuid", "p_order_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_orders_for_tracking"("p_tenant_id" "uuid", "p_order_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_orders_for_tracking"("p_tenant_id" "uuid", "p_order_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_owner_dashboard"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_owner_dashboard"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_owner_dashboard"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_stock_status"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_stock_status"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stock_status"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tenant_by_slug"("p_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tenant_by_slug"("p_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tenant_by_slug"("p_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tenant_public_by_id"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tenant_public_by_id"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tenant_public_by_id"("p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_top_items"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_top_items"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_items"("p_tenant_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_login_count"("admin_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_login_count"("admin_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_login_count"("admin_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_menu_item_favorites"("p_item" "uuid", "p_tenant" "uuid", "p_delta" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_menu_item_favorites"("p_item" "uuid", "p_tenant" "uuid", "p_delta" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_menu_item_favorites"("p_item" "uuid", "p_tenant" "uuid", "p_delta" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_menu_item_favorites"("p_item" "uuid", "p_tenant" "uuid", "p_delta" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."next_order_number"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."next_order_number"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_order_number"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_super_admin_elevation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_super_admin_elevation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_super_admin_elevation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."provision_signup_tenant"("p_slug" "text", "p_name" "text", "p_plan" "text", "p_user_id" "uuid", "p_email" "text", "p_full_name" "text", "p_phone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provision_signup_tenant"("p_slug" "text", "p_name" "text", "p_plan" "text", "p_user_id" "uuid", "p_email" "text", "p_full_name" "text", "p_phone" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reset_tenant_data"("p_tenant_id" "uuid", "p_reset_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_tenant_data"("p_tenant_id" "uuid", "p_reset_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_opening_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_opening_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_opening_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_quantity" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_trial_end_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_trial_end_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_trial_end_date"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."unclaim_coupon_usage"("p_coupon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unclaim_coupon_usage"("p_coupon_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unclaim_coupon_usage"("p_coupon_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ingredients_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ingredients_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ingredients_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_menus_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_menus_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_menus_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_suppliers_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_suppliers_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_suppliers_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_tenant_supports_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_tenant_supports_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tenant_supports_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_preferences_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_preferences_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_preferences_updated_at"() TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."admin_users" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."admin_users" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_users" TO "service_role";



GRANT UPDATE("full_name") ON TABLE "public"."admin_users" TO "authenticated";



GRANT UPDATE("is_active") ON TABLE "public"."admin_users" TO "authenticated";



GRANT UPDATE("last_login") ON TABLE "public"."admin_users" TO "authenticated";



GRANT UPDATE("phone") ON TABLE "public"."admin_users" TO "authenticated";



GRANT UPDATE("last_login_at") ON TABLE "public"."admin_users" TO "authenticated";



GRANT UPDATE("login_count") ON TABLE "public"."admin_users" TO "authenticated";



GRANT ALL ON TABLE "public"."ads" TO "anon";
GRANT ALL ON TABLE "public"."ads" TO "authenticated";
GRANT ALL ON TABLE "public"."ads" TO "service_role";



GRANT ALL ON TABLE "public"."ai_credits_ledger" TO "anon";
GRANT ALL ON TABLE "public"."ai_credits_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_credits_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."ai_photo_credits" TO "anon";
GRANT ALL ON TABLE "public"."ai_photo_credits" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_photo_credits" TO "service_role";



GRANT ALL ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."coupons" TO "anon";
GRANT ALL ON TABLE "public"."coupons" TO "authenticated";
GRANT ALL ON TABLE "public"."coupons" TO "service_role";



GRANT ALL ON TABLE "public"."dish_photo_drafts" TO "anon";
GRANT ALL ON TABLE "public"."dish_photo_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."dish_photo_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."ingredients" TO "anon";
GRANT ALL ON TABLE "public"."ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."invitations" TO "anon";
GRANT ALL ON TABLE "public"."invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."invitations" TO "service_role";



GRANT ALL ON TABLE "public"."item_modifiers" TO "anon";
GRANT ALL ON TABLE "public"."item_modifiers" TO "authenticated";
GRANT ALL ON TABLE "public"."item_modifiers" TO "service_role";



GRANT ALL ON TABLE "public"."item_options" TO "anon";
GRANT ALL ON TABLE "public"."item_options" TO "authenticated";
GRANT ALL ON TABLE "public"."item_options" TO "service_role";



GRANT ALL ON TABLE "public"."item_price_variants" TO "anon";
GRANT ALL ON TABLE "public"."item_price_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."item_price_variants" TO "service_role";



GRANT ALL ON TABLE "public"."item_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."item_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."item_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."menu_items" TO "anon";
GRANT ALL ON TABLE "public"."menu_items" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_items" TO "service_role";



GRANT ALL ON TABLE "public"."menus" TO "anon";
GRANT ALL ON TABLE "public"."menus" TO "authenticated";
GRANT ALL ON TABLE "public"."menus" TO "service_role";



GRANT ALL ON TABLE "public"."newsletter_subscriber" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_subscriber" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_subscriber" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_progress" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_progress" TO "service_role";



GRANT ALL ON TABLE "public"."orange_money_events" TO "anon";
GRANT ALL ON TABLE "public"."orange_money_events" TO "authenticated";
GRANT ALL ON TABLE "public"."orange_money_events" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."order_items" TO "anon";



GRANT SELECT("order_id") ON TABLE "public"."order_items" TO "anon";



GRANT SELECT("menu_item_id") ON TABLE "public"."order_items" TO "anon";



GRANT SELECT("quantity") ON TABLE "public"."order_items" TO "anon";



GRANT SELECT("price_at_order") ON TABLE "public"."order_items" TO "anon";



GRANT SELECT("item_name") ON TABLE "public"."order_items" TO "anon";



GRANT SELECT("item_name_en") ON TABLE "public"."order_items" TO "anon";



GRANT SELECT("created_at") ON TABLE "public"."order_items" TO "anon";



GRANT SELECT("item_status") ON TABLE "public"."order_items" TO "anon";



GRANT SELECT("course") ON TABLE "public"."order_items" TO "anon";



GRANT SELECT("modifiers") ON TABLE "public"."order_items" TO "anon";



GRANT SELECT("preparation_zone") ON TABLE "public"."order_items" TO "anon";



GRANT SELECT("selected_option") ON TABLE "public"."order_items" TO "anon";



GRANT SELECT("selected_variant") ON TABLE "public"."order_items" TO "anon";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("tenant_id") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("venue_id") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("order_number") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("table_number") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("status") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("subtotal") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("tax") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("total") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("created_at") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("updated_at") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("completed_at") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("service_type") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("tax_amount") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("service_charge_amount") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("discount_amount") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("payment_method") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("payment_status") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("paid_at") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("coupon_id") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("assigned_to") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("cashier_id") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("server_id") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("display_currency") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("tip_amount") ON TABLE "public"."orders" TO "anon";



GRANT SELECT("preparation_zone") ON TABLE "public"."orders" TO "anon";



GRANT ALL ON TABLE "public"."platform_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."platform_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."recipes" TO "anon";
GRANT ALL ON TABLE "public"."recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."recipes" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_groups" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_groups" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."settings" TO "anon";
GRANT ALL ON TABLE "public"."settings" TO "authenticated";
GRANT ALL ON TABLE "public"."settings" TO "service_role";



GRANT ALL ON TABLE "public"."stock_alert_notifications" TO "anon";
GRANT ALL ON TABLE "public"."stock_alert_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_alert_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."stock_movements" TO "anon";
GRANT ALL ON TABLE "public"."stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movements" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_events" TO "anon";
GRANT ALL ON TABLE "public"."stripe_events" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_events" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."table_assignments" TO "anon";
GRANT ALL ON TABLE "public"."table_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."table_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."tables" TO "anon";
GRANT ALL ON TABLE "public"."tables" TO "authenticated";
GRANT ALL ON TABLE "public"."tables" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_supports" TO "anon";
GRANT ALL ON TABLE "public"."tenant_supports" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_supports" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tenants" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";



GRANT UPDATE("slug") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("name") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("logo_url") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("primary_color") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("updated_at") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("onboarding_completed") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("onboarding_completed_at") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("secondary_color") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("description") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("establishment_type") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("address") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("city") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("country") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("phone") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("table_count") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("notification_sound_id") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("currency") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("tax_rate") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("service_charge_rate") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("enable_tax") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("enable_service_charge") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("idle_timeout_minutes") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("screen_lock_mode") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("default_locale") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("supported_currencies") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("enable_coupons") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("bar_display_enabled") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("opening_hours") ON TABLE "public"."tenants" TO "authenticated";



GRANT ALL ON TABLE "public"."user_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."user_sessions" TO "anon";
GRANT ALL ON TABLE "public"."user_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."venues" TO "anon";
GRANT ALL ON TABLE "public"."venues" TO "authenticated";
GRANT ALL ON TABLE "public"."venues" TO "service_role";



GRANT ALL ON TABLE "public"."wave_events" TO "anon";
GRANT ALL ON TABLE "public"."wave_events" TO "authenticated";
GRANT ALL ON TABLE "public"."wave_events" TO "service_role";



GRANT ALL ON TABLE "public"."zones" TO "anon";
GRANT ALL ON TABLE "public"."zones" TO "authenticated";
GRANT ALL ON TABLE "public"."zones" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







