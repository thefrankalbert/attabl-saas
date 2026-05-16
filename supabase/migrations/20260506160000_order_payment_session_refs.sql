-- Store external payment session references for idempotency and callback verification.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS orange_money_pay_token TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS orange_money_notif_token TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wave_checkout_id TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_orange_pay_token
  ON orders (orange_money_pay_token)
  WHERE orange_money_pay_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_wave_checkout_id
  ON orders (wave_checkout_id)
  WHERE wave_checkout_id IS NOT NULL;
