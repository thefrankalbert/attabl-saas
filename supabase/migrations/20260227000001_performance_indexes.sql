-- Performance indexes for critical query paths
-- Applied: 2026-02-27
-- Note: table_assignments indexes removed (table does not exist yet)
-- Note: menu_items index uses (tenant_id, category_id) - display_order column does not exist

-- Index for stock movements listing (inventory.service.ts)
CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_created
  ON stock_movements (tenant_id, created_at DESC);

-- Index for orders by tenant + status (KDS, orders page)
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status_created
  ON orders (tenant_id, status, created_at DESC);

-- Index for order items by order
CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON order_items (order_id);

-- Index for menu items by tenant + category (menu page)
CREATE INDEX IF NOT EXISTS idx_menu_items_tenant_category
  ON menu_items (tenant_id, category_id);

-- Index for ingredients stock alerts (notification.service.ts)
CREATE INDEX IF NOT EXISTS idx_ingredients_stock_alert
  ON ingredients (tenant_id, is_active, current_stock, min_stock_alert)
  WHERE is_active = true;

-- Index for stock alert rate limiting
CREATE INDEX IF NOT EXISTS idx_stock_alerts_rate_limit
  ON stock_alert_notifications (tenant_id, ingredient_id, sent_at DESC);

-- Index for admin_users tenant lookup
CREATE INDEX IF NOT EXISTS idx_admin_users_tenant
  ON admin_users (tenant_id, user_id);

-- Index for coupons validation
CREATE INDEX IF NOT EXISTS idx_coupons_validation
  ON coupons (tenant_id, code, is_active)
  WHERE is_active = true;
