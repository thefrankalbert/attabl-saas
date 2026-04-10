-- Add CHECK constraint on orders.status to prevent invalid statuses
-- Identified during security audit: without this constraint, any status
-- string could be inserted, bypassing the application-level validation.

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'served', 'cancelled'));
