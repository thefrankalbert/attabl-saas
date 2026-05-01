-- Phase 4: Mobile money payment methods
-- Adds wave/orange_money/mtn_momo/free_money to order constraints,
-- enabled_payment_methods toggle per tenant, and idempotency tables
-- for Wave and Orange Money webhooks.

-- 1. Migrate legacy mobile_money orders (ambiguous — set to NULL)
UPDATE orders SET payment_method = NULL WHERE payment_method = 'mobile_money';

-- 2. Update orders.payment_method constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('cash', 'card', 'wave', 'orange_money', 'mtn_momo', 'free_money'));

-- 3. Add enabled_payment_methods column to tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS enabled_payment_methods TEXT[]
  NOT NULL DEFAULT ARRAY['cash', 'card']::TEXT[];

-- 4. Wave events idempotency table
CREATE TABLE IF NOT EXISTS public.wave_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  wave_created_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wave_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS wave_events_processed_at_idx
  ON public.wave_events (processed_at DESC);

COMMENT ON TABLE public.wave_events IS
  'Idempotency log for Wave webhook events. INSERT ON CONFLICT detects replays.';

-- 5. Orange Money events idempotency table
CREATE TABLE IF NOT EXISTS public.orange_money_events (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orange_money_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS orange_money_events_processed_at_idx
  ON public.orange_money_events (processed_at DESC);

COMMENT ON TABLE public.orange_money_events IS
  'Idempotency log for Orange Money callback events. INSERT ON CONFLICT detects replays.';
