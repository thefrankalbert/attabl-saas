-- Populate orders.table_id on every new order (audit: orders.table_id + H5).
--
-- The orders.table_id FK column + a one-shot backfill landed in
-- 20260525130000_service_table_assignments_orders_table_id.sql, but
-- create_order_with_items never set it: NEW orders kept table_id = NULL while
-- only table_number (free text) was stored, so the normalized FK silently rotted.
-- This recreates the RPC to RESOLVE table_id from table_number against the
-- tenant's configured tables (best-effort, no hard block per product decision
-- 2026-06-30: a free-text / unscanned table is still accepted with table_id NULL,
-- so POS free-text and table-less QR orders are never rejected).
--
-- The body is copied VERBATIM from the live definition recreated in
-- 20260629000600_table_sessions.sql (21 args, dedup + find-or-create session +
-- unique_violation handler). The ONLY additions are the v_table_id lookup and
-- the table_id column in the INSERT. Same 21-arg signature => retro-compatible.
--
-- APPLY TO PROD BACKUP-FIRST, deployed with the code (pure improvement: the FK is
-- now kept current going forward). Additive behaviour only.

CREATE OR REPLACE FUNCTION public.create_order_with_items(
  p_tenant_id uuid,
  p_order_number text,
  p_total numeric,
  p_table_number text DEFAULT NULL::text,
  p_customer_name text DEFAULT NULL::text,
  p_customer_phone text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_service_type text DEFAULT 'dine_in'::text,
  p_room_number text DEFAULT NULL::text,
  p_delivery_address text DEFAULT NULL::text,
  p_subtotal numeric DEFAULT NULL::numeric,
  p_tax_amount numeric DEFAULT 0,
  p_service_charge_amount numeric DEFAULT 0,
  p_discount_amount numeric DEFAULT 0,
  p_tip_amount numeric DEFAULT 0,
  p_coupon_id uuid DEFAULT NULL::uuid,
  p_server_id uuid DEFAULT NULL::uuid,
  p_display_currency text DEFAULT NULL::text,
  p_preparation_zone text DEFAULT 'kitchen'::text,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_client_request_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_total numeric;
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
      RETURN jsonb_build_object(
        'orderId', v_order_id,
        'orderNumber', v_order_number,
        'total', v_total,
        'deduplicated', true
      );
    END IF;
  END IF;

  -- Resolve the configured table FK from the free-text table_number (audit
  -- orders.table_id + H5). Best-effort: an unmatched number leaves table_id NULL
  -- (no rejection). Matches the one-shot backfill join: tables -> zones -> venues.
  IF p_table_number IS NOT NULL THEN
    SELECT t.id INTO v_table_id
      FROM tables t
      JOIN zones z ON z.id = t.zone_id
      JOIN venues v ON v.id = z.venue_id
      WHERE v.tenant_id = p_tenant_id
        AND (t.table_number = p_table_number OR t.display_name = p_table_number)
      LIMIT 1;
  END IF;

  -- Dine-in: attach to the table's OPEN session (find-or-create) instead of
  -- rejecting a second round. Serialize per table to avoid duplicate sessions.
  IF p_table_number IS NOT NULL
    AND COALESCE(p_service_type, 'dine_in') = 'dine_in'
  THEN
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || p_table_number));

    SELECT id INTO v_session_id
      FROM table_sessions
      WHERE tenant_id = p_tenant_id
        AND table_number = p_table_number
        AND status = 'open'
      LIMIT 1;

    IF v_session_id IS NULL THEN
      INSERT INTO table_sessions (tenant_id, table_number)
      VALUES (p_tenant_id, p_table_number)
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

EXCEPTION
  WHEN unique_violation THEN
    IF p_client_request_id IS NULL THEN
      RAISE;
    END IF;
    SELECT id, order_number, total
      INTO v_order_id, v_order_number, v_total
      FROM orders
      WHERE tenant_id = p_tenant_id
        AND client_request_id = p_client_request_id;
    IF NOT FOUND THEN
      RAISE;
    END IF;
    RETURN jsonb_build_object(
      'orderId', v_order_id,
      'orderNumber', v_order_number,
      'total', v_total,
      'deduplicated', true
    );
END;
$function$;
