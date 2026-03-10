-- Add tip_amount column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tip_amount NUMERIC DEFAULT 0;

-- Comment for documentation
COMMENT ON COLUMN orders.tip_amount IS 'Tip/pourboire amount in base currency (XAF). Set from client cart or admin payment modal.';
