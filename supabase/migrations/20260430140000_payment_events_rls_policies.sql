-- Add RLS policies for wave_events and orange_money_events tables.
-- These are server-only idempotency tables accessed exclusively via service_role.
-- Deny all access from authenticated and anon roles (belt-and-suspenders).

CREATE POLICY "wave_events_service_only"
  ON public.wave_events
  AS RESTRICTIVE
  FOR ALL
  TO authenticated, anon
  USING (false);

CREATE POLICY "orange_money_events_service_only"
  ON public.orange_money_events
  AS RESTRICTIVE
  FOR ALL
  TO authenticated, anon
  USING (false);
