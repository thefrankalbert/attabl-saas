-- Add preparation_zone to order_items table
-- Denormalized from the item's category at order creation time.
-- Values: 'kitchen' (default), 'bar', 'both'
-- This allows the KDS and kitchen ticket printer to filter items
-- without joining the categories table at display time.

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS preparation_zone TEXT NOT NULL DEFAULT 'kitchen'
  CHECK (preparation_zone IN ('kitchen', 'bar', 'both'));

COMMENT ON COLUMN order_items.preparation_zone IS 'Preparation zone copied from the item category at order time: kitchen, bar, or both';
