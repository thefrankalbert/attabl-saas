-- ============================================
-- Atomic activation_events claim - prevents lost updates.
-- The previous client-side read-modify-write of the JSONB
-- activation_events column overwrote a stale snapshot, so two
-- concurrent writers (e.g. the order activation-email block and
-- the monthly-quota block within the same request) could drop a
-- key the other had just set. This RPC merges into the LIVE row
-- value with the jsonb concat operator (||), so other keys are
-- preserved while keeping the once-only guard: it claims the slot
-- only when the key is not already present.
-- Returns TRUE when the caller won the claim, FALSE otherwise.
-- ============================================

CREATE OR REPLACE FUNCTION claim_activation_event(p_tenant_id UUID, p_event_key TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_rows INT;
BEGIN
  UPDATE tenants
  SET activation_events =
    coalesce(activation_events, '{}'::JSONB) || jsonb_build_object(p_event_key, to_jsonb(NOW()))
  WHERE id = p_tenant_id
    AND (activation_events->>p_event_key) IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- SECURITY DEFINER bypasses RLS; this RPC is only ever called from the order
-- flow via the service_role admin client (orders/route.ts, orders/pos/route.ts).
-- Remove the default PUBLIC grant so anon/authenticated cannot call it directly
-- to forge cross-tenant activation_events (consistent with 20260622140000).
REVOKE EXECUTE ON FUNCTION public.claim_activation_event(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_activation_event(uuid, text) TO service_role;
