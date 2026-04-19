-- H7: Add missing index on orders(tenant_id, order_number)
-- The next_order_number RPC does a LIKE scan on this combination for every order creation
CREATE INDEX IF NOT EXISTS idx_orders_tenant_order_number
  ON orders(tenant_id, order_number text_pattern_ops);
