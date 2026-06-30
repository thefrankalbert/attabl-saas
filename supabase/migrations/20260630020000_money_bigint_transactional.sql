-- Money -> integer MINOR UNITS (BIGINT) for the TRANSACTIONAL columns.
--
-- WHY: money was stored as NUMERIC in MAJOR units (e.g. 12.50 EUR). Float/numeric
-- major-unit math drifts on sums and there is no single integer source of truth.
-- This converts the transactional money columns to BIGINT holding the currency's
-- smallest tenderable unit (MINOR units): for a 0-decimal currency the minor unit
-- IS the major unit (XAF/XOF: 1000 -> 1000, identity), for a 2-decimal currency
-- it is x100 (EUR/USD: 12.50 -> 1250). The application (order.service /
-- payment.service / display helpers) converts at the boundary via
-- src/lib/utils/money.ts (toMinorUnits / fromMinorUnits / formatCurrencyMinor).
--
-- SCOPE (transactional only): orders.{total, subtotal, tax_amount,
-- service_charge_amount, discount_amount, tip_amount}, order_items.price_at_order,
-- payments.amount. Catalog money (menu_items.price, item_modifiers.price,
-- item_price_variants.price, coupons.discount_value, the multi-currency `prices`
-- jsonb, plan/billing prices) stays NUMERIC major - it is converted to minor at
-- the order-intake boundary, not stored as minor.
--
-- PER-ROW CONVERSION: multiply by 10^decimals of the ROW's currency, rounded to an
-- integer. The currency is orders.display_currency for orders.*; for
-- order_items.price_at_order and payments.amount it is the parent order's
-- display_currency (joined). NULL / XAF / XOF -> 0 decimals (value unchanged),
-- EUR / USD -> 2 decimals (value * 100). For the live data (all XAF tenants) this
-- is an IDENTITY value change - only the column TYPE changes from numeric to bigint.
--
-- APPLY TO PROD BACKUP-FIRST. The code that reads/writes these columns as minor
-- units deploys TOGETHER with this migration (do not apply DB-only).
--
-- The RPC create_order_with_items is RECREATED below because its money params
-- (p_total, p_subtotal, p_tax_amount, p_service_charge_amount, p_discount_amount,
-- p_tip_amount) must now be BIGINT to match the columns, and price_at_order is
-- cast to bigint. The body is copied VERBATIM from the live definition in
-- 20260630000000_order_table_id_resolution.sql; the ONLY changes are the money
-- param types (numeric -> bigint), the v_total local (numeric -> bigint), and the
-- price_at_order COALESCE cast (::numeric -> ::bigint). Same 21-arg signature.

-- ── 1. Convert transactional columns to BIGINT minor units ──────────────────

ALTER TABLE public.orders
  ALTER COLUMN total TYPE bigint USING round(
    total * CASE
      WHEN display_currency IN ('EUR', 'USD') THEN 100
      ELSE 1
    END
  )::bigint,
  ALTER COLUMN subtotal TYPE bigint USING round(
    subtotal * CASE
      WHEN display_currency IN ('EUR', 'USD') THEN 100
      ELSE 1
    END
  )::bigint,
  ALTER COLUMN tax_amount TYPE bigint USING round(
    tax_amount * CASE
      WHEN display_currency IN ('EUR', 'USD') THEN 100
      ELSE 1
    END
  )::bigint,
  ALTER COLUMN service_charge_amount TYPE bigint USING round(
    service_charge_amount * CASE
      WHEN display_currency IN ('EUR', 'USD') THEN 100
      ELSE 1
    END
  )::bigint,
  ALTER COLUMN discount_amount TYPE bigint USING round(
    discount_amount * CASE
      WHEN display_currency IN ('EUR', 'USD') THEN 100
      ELSE 1
    END
  )::bigint,
  ALTER COLUMN tip_amount TYPE bigint USING round(
    tip_amount * CASE
      WHEN display_currency IN ('EUR', 'USD') THEN 100
      ELSE 1
    END
  )::bigint;

-- order_items / payments take their currency from the PARENT order. Postgres
-- forbids a subquery in an ALTER ... USING transform, so scale the EUR/USD rows
-- in place first (still numeric), then change the type with a plain round().
UPDATE public.order_items oi
  SET price_at_order = oi.price_at_order * 100
  FROM public.orders o
  WHERE o.id = oi.order_id AND o.display_currency IN ('EUR', 'USD');

ALTER TABLE public.order_items
  ALTER COLUMN price_at_order TYPE bigint USING round(price_at_order)::bigint;

UPDATE public.payments p
  SET amount = p.amount * 100
  FROM public.orders o
  WHERE o.id = p.order_id AND o.display_currency IN ('EUR', 'USD');

ALTER TABLE public.payments
  ALTER COLUMN amount TYPE bigint USING round(amount)::bigint;

-- ── 2. Recreate create_order_with_items with BIGINT money params ─────────────
-- Body copied verbatim from 20260630000000_order_table_id_resolution.sql; only
-- the money types and the price_at_order cast change.
--
-- The money params change type (numeric -> bigint), which is a DIFFERENT function
-- signature, so CREATE OR REPLACE would leave the old numeric-param overload in
-- place and PostgREST RPC resolution would become ambiguous. Drop the old
-- signature first so exactly one create_order_with_items remains.

DROP FUNCTION IF EXISTS public.create_order_with_items(
  uuid, text, numeric, text, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, numeric, uuid, uuid, text, text, jsonb, uuid
);

CREATE OR REPLACE FUNCTION public.create_order_with_items(
  p_tenant_id uuid,
  p_order_number text,
  p_total bigint,
  p_table_number text DEFAULT NULL::text,
  p_customer_name text DEFAULT NULL::text,
  p_customer_phone text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_service_type text DEFAULT 'dine_in'::text,
  p_room_number text DEFAULT NULL::text,
  p_delivery_address text DEFAULT NULL::text,
  p_subtotal bigint DEFAULT NULL::bigint,
  p_tax_amount bigint DEFAULT 0,
  p_service_charge_amount bigint DEFAULT 0,
  p_discount_amount bigint DEFAULT 0,
  p_tip_amount bigint DEFAULT 0,
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
