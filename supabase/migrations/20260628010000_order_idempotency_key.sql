-- Order idempotency key (offline-first write layer, PR1).
--
-- Goal: an order created offline on a tablet and replayed on reconnect must NOT
-- create a duplicate. The client mints a stable UUID (client_request_id) at the
-- moment the order is composed; the server dedupes on it.
--
-- Additive + backward-compatible: the column is nullable, the unique index is
-- partial (NULL keys unconstrained), and the RPC param defaults to NULL, so
-- existing/online callers that send no key keep working unchanged. Safe to apply
-- before or after the code deploy.
--
-- Rollback:
--   DROP INDEX IF EXISTS uq_orders_tenant_client_request_id;
--   ALTER TABLE orders DROP COLUMN IF EXISTS client_request_id;
--   (and restore the 20-arg create_order_with_items from 20260516140000)

-- 1. Client-minted idempotency token.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_request_id uuid;

-- 2. One order per (tenant, client_request_id). Partial so legacy/online orders
--    without a key are never blocked. Also serves the dedup lookup.
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_tenant_client_request_id
  ON orders (tenant_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- 3. Idempotent order-creation RPC.
--    Adding p_client_request_id changes the signature, so Postgres would create a
--    SECOND overload and leave it EXECUTE-able by PUBLIC (re-opening the price
--    bypass locked in 20260628000000). Drop the old 20-arg overload, create the
--    21-arg one, and re-apply the same service_role-only lockdown.
DROP FUNCTION IF EXISTS create_order_with_items(
  uuid, text, numeric, text, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, numeric, uuid, uuid, text, text, jsonb
);

CREATE FUNCTION create_order_with_items(
  p_tenant_id uuid,
  p_order_number text,
  p_total numeric,
  p_table_number text DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_service_type text DEFAULT 'dine_in',
  p_room_number text DEFAULT NULL,
  p_delivery_address text DEFAULT NULL,
  p_subtotal numeric DEFAULT NULL,
  p_tax_amount numeric DEFAULT 0,
  p_service_charge_amount numeric DEFAULT 0,
  p_discount_amount numeric DEFAULT 0,
  p_tip_amount numeric DEFAULT 0,
  p_coupon_id uuid DEFAULT NULL,
  p_server_id uuid DEFAULT NULL,
  p_display_currency text DEFAULT NULL,
  p_preparation_zone text DEFAULT 'kitchen',
  p_items jsonb DEFAULT '[]'::jsonb,
  p_client_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_total numeric;
  v_item jsonb;
BEGIN
  -- Idempotent replay (fast path): if this key already produced an order for
  -- this tenant, return it unchanged. This must run BEFORE the active-table
  -- guard, otherwise a replay would collide with the order it itself created
  -- and raise a false TABLE_ACTIVE_ORDER.
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
    coupon_id, server_id, display_currency, preparation_zone,
    client_request_id
  ) VALUES (
    p_tenant_id, p_order_number, 'pending', p_total, p_table_number,
    p_customer_name, p_customer_phone, p_notes,
    p_service_type, p_room_number, p_delivery_address,
    COALESCE(p_subtotal, p_total), p_tax_amount, p_service_charge_amount,
    p_discount_amount, p_tip_amount, 'pending',
    p_coupon_id, p_server_id, p_display_currency, p_preparation_zone,
    p_client_request_id
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- selected_option / selected_variant are preserved from the live prod
    -- function (added out-of-band, never in the repo migration chain). Omitting
    -- them here would silently drop those columns from the insert.
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
  -- Concurrent replay raced past the fast-path SELECT; the partial unique index
  -- rejected the duplicate insert. Return the winning row instead of erroring.
  -- Only treat this as dedup when a key is present AND the surviving row matches
  -- it; otherwise the violation came from a different constraint - re-raise.
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
$$;

-- Re-apply the lockdown from 20260628000000 to the new 21-arg signature.
REVOKE EXECUTE ON FUNCTION public.create_order_with_items(
  uuid, text, numeric, text, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, numeric, uuid, uuid, text, text, jsonb, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_order_with_items(
  uuid, text, numeric, text, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, numeric, uuid, uuid, text, text, jsonb, uuid
) TO service_role;
