-- H9: Atomic order creation
-- Creates an order and its items in a single transaction.
-- If item insertion fails, the entire operation is rolled back.
-- This replaces the application-level rollback in order.service.ts.

CREATE OR REPLACE FUNCTION create_order_with_items(
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
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_item jsonb;
BEGIN
  -- 1. Insert the order
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

  -- 2. Insert all items (atomic - if any fail, entire transaction rolls back)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (
      order_id, menu_item_id, item_name, item_name_en,
      quantity, price_at_order, customer_notes,
      modifiers, course, item_status, preparation_zone
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
      COALESCE(v_item->>'preparation_zone', 'kitchen')
    );
  END LOOP;

  -- 3. Return the created order info
  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', p_order_number,
    'total', p_total
  );
END;
$$;
