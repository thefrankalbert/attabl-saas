-- Add preparation_zone to categories table
-- Values: 'kitchen' (default), 'bar', 'both'
-- This determines where orders containing items from this category are routed

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS preparation_zone TEXT NOT NULL DEFAULT 'kitchen'
  CHECK (preparation_zone IN ('kitchen', 'bar', 'both'));

-- Add preparation_zone to orders table
-- Computed at order creation time from the categories of the items
-- Values: 'kitchen', 'bar', 'mixed' (items from both zones)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS preparation_zone TEXT NOT NULL DEFAULT 'kitchen'
  CHECK (preparation_zone IN ('kitchen', 'bar', 'mixed'));

-- Index for KDS filtering by preparation_zone
CREATE INDEX IF NOT EXISTS idx_orders_tenant_prep_zone
  ON orders (tenant_id, preparation_zone, status)
  WHERE status IN ('pending', 'preparing', 'ready');

COMMENT ON COLUMN categories.preparation_zone IS 'Where items in this category are prepared: kitchen, bar, or both';
COMMENT ON COLUMN orders.preparation_zone IS 'Routing destination: kitchen-only, bar-only, or mixed';
