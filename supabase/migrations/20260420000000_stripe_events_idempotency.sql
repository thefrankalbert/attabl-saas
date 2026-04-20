-- Stripe webhook idempotency
-- Persists every processed Stripe event id so a replayed event
-- (Stripe retries up to 3 days, plus manual dashboard replays) is
-- detected and short-circuited instead of re-applying side effects
-- to the tenant subscription state.

CREATE TABLE IF NOT EXISTS public.stripe_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  stripe_created_at timestamptz,
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- Only the service_role writes to this table. RLS blocks everything
-- else so even a leaked anon key cannot enumerate event ids.
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

-- No policies granted to anon/authenticated on purpose.
-- The service_role bypasses RLS.

CREATE INDEX IF NOT EXISTS stripe_events_processed_at_idx
  ON public.stripe_events (processed_at DESC);

COMMENT ON TABLE public.stripe_events IS
  'Idempotency log for Stripe webhook events. INSERT ON CONFLICT is used
   at the start of every webhook handler to detect replayed events.';
