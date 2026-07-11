-- is_table_occupied: does a given table currently hold an OPEN session?
-- ============================================================================
-- The storefront is anonymous, and the table_sessions RLS policies require tenant
-- membership, so an anon customer cannot read table_sessions directly. This
-- SECURITY DEFINER function exposes ONLY a single boolean for a specific
-- (tenant, table_number) pair - no rows, no session detail - so the menu page can
-- softly warn a customer who scanned a QR for a table that is already taken
-- (a likely different party) without leaking any data.
--
-- Read-only, STABLE. Granted to anon (storefront) + authenticated + service_role.
-- Additive migration (new function only). MIGRATION-FIRST: apply before deploying
-- the code that calls it.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_table_occupied(
  p_tenant_id uuid,
  p_table_number text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM table_sessions
    WHERE tenant_id = p_tenant_id
      AND table_number = p_table_number
      AND status = 'open'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_table_occupied(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_table_occupied(uuid, text) TO anon, authenticated, service_role;
