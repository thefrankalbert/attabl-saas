-- Add behavioral tracking columns to tenants.
-- activation_events: JSONB map of event_name -> ISO timestamp when event first occurred.
-- last_active_at: updated on every admin dashboard visit (fire-and-forget).

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS activation_events JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
