-- P1: Active table guard, payment session expiry, atomic destock.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_initiated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_stale_payment_sessions
  ON orders (payment_initiated_at)
  WHERE payment_status = 'pending'
    AND payment_initiated_at IS NOT NULL
    AND (wave_checkout_id IS NOT NULL OR orange_money_pay_token IS NOT NULL);

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

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', p_order_number,
    'total', p_total
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.destock_order(
  p_order_id UUID,
  p_tenant_id UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.expire_stale_payment_sessions(
  p_max_age_minutes INT DEFAULT 30
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
