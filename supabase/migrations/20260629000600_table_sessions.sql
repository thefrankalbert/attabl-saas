-- Open table sessions / checks (audit finding C1 - the root cause).
--
-- ATTABL modelled ordering as one-shot isolated orders: a 2nd dine-in order on an
-- occupied table was REJECTED (TABLE_ACTIVE_ORDER), so a guest could not order a
-- 2nd round, and the cashier had no single "check" to settle. Real POS are built
-- around an OPEN CHECK/SESSION per table that accumulates rounds and is settled
-- once. This introduces table_sessions and attaches orders to a session.
--
-- Backward-compatible: create_order_with_items keeps the SAME 21-arg signature
-- (the deployed app calls it unchanged); the only behavioural change is that a
-- dine-in order now FINDS-OR-CREATES the table's open session and attaches to it,
-- instead of raising TABLE_ACTIVE_ORDER. Deployed callers simply stop getting the
-- "table occupee" error - a pure improvement.
--
-- The RPC body below is copied VERBATIM from the live production definition
-- (pg_get_functiondef captured 2026-06-29: 21 args incl. p_client_request_id,
-- selected_option/selected_variant, dedup + unique_violation handler) with ONLY
-- the session logic swapped in for the TABLE_ACTIVE_ORDER block. Do not regenerate
-- from the repo's older schema.sql copy.
--
-- APPLY TO PROD BACKUP-FIRST, code deployed together (behavioural change). Tiny
-- tables today (103 orders) so backfill/locks are non-issues.

-- 1. table_sessions
CREATE TABLE IF NOT EXISTS public.table_sessions (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  table_number text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

-- At most one OPEN session per table (partial unique index = the upsert target).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_session_per_table
  ON public.table_sessions (tenant_id, table_number)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_table_sessions_tenant_status
  ON public.table_sessions (tenant_id, status);

ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "table_sessions_tenant_select" ON public.table_sessions;
CREATE POLICY "table_sessions_tenant_select" ON public.table_sessions
  FOR SELECT TO authenticated
  USING (tenant_id = ANY (public.get_my_tenant_ids_array()));

DROP POLICY IF EXISTS "table_sessions_tenant_write" ON public.table_sessions;
CREATE POLICY "table_sessions_tenant_write" ON public.table_sessions
  FOR ALL TO authenticated
  USING (tenant_id = ANY (public.get_my_tenant_ids_array()))
  WITH CHECK (tenant_id = ANY (public.get_my_tenant_ids_array()));

GRANT SELECT, INSERT, UPDATE ON TABLE public.table_sessions TO authenticated;
GRANT ALL ON TABLE public.table_sessions TO service_role;

-- 2. orders.session_id (attach orders/rounds to an open session).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.table_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_session ON public.orders (session_id);

-- 3. Recreate create_order_with_items: find-or-create open session for dine-in
--    instead of rejecting. SAME signature, SAME body, only the table block changes.
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
    tenant_id, order_number, status, total, table_number,
    customer_name, customer_phone, notes,
    service_type, room_number, delivery_address,
    subtotal, tax_amount, service_charge_amount,
    discount_amount, tip_amount, payment_status,
    coupon_id, server_id, display_currency, preparation_zone,
    client_request_id, session_id
  ) VALUES (
    p_tenant_id, p_order_number, 'pending', p_total, p_table_number,
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
