-- Reassign a dine-in order to a different (free or shared) table.
-- ============================================================================
-- WHY: a server sometimes seats a party, fires an order, then has to move it to
-- another table (wrong table tapped, party relocated, table freed up). Doing this
-- as two client writes (update orders.table_number, then fix table_sessions) races
-- badly: a second round could attach to the old session, or the moved order could
-- orphan an empty open session that then swallows tomorrow's orders on that table.
--
-- This RPC does the whole move in ONE transaction:
--   - find-or-create the OPEN session on the destination table (same advisory-lock
--     find-or-create as create_order_with_items, migration
--     20260630020000_money_bigint_transactional.sql),
--   - repoint orders.table_number + orders.session_id,
--   - close the OLD session if it no longer holds any unsettled order (same rule as
--     closeSessionIfFullySettled in src/services/order/order-lifecycle.ts: a session
--     with 0 orders that are payment_status='pending' AND status != 'cancelled').
--
-- Both table sessions are advisory-locked in a deterministic (sorted) order so two
-- concurrent reassigns can never deadlock.
--
-- Security posture mirrors the report/stock RPCs: SECURITY DEFINER +
-- assert_tenant_member(p_tenant_id) so a logged-in user cannot pass another
-- tenant's id, EXECUTE revoked from PUBLIC/anon and granted to authenticated +
-- service_role only.
--
-- Additive migration (new function only). MIGRATION-FIRST: apply this to the
-- database BEFORE deploying the code that calls it (actionReassignOrderTable).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reassign_order_table(
  p_order_id uuid,
  p_tenant_id uuid,
  p_new_table_number text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_table_number text;
  v_old_session_id uuid;
  v_service_type text;
  v_status text;
  v_new_session_id uuid;
  v_pending_count integer;
BEGIN
  -- Tenant-isolation guard: a member cannot reassign another tenant's order.
  PERFORM public.assert_tenant_member(p_tenant_id);

  -- Load the order, scoped to the tenant.
  SELECT table_number, session_id, service_type, status
    INTO v_old_table_number, v_old_session_id, v_service_type, v_status
    FROM orders
    WHERE id = p_order_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'no_data_found';
  END IF;

  -- Only dine-in orders live on a table / session.
  IF v_service_type IS DISTINCT FROM 'dine_in' THEN
    RAISE EXCEPTION 'Only dine-in orders can be reassigned' USING ERRCODE = 'check_violation';
  END IF;

  -- A cancelled order is terminal; moving it would resurrect it onto a table.
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot reassign a cancelled order' USING ERRCODE = 'check_violation';
  END IF;

  -- Destination table must be a real, non-empty label.
  IF p_new_table_number IS NULL OR btrim(p_new_table_number) = '' THEN
    RAISE EXCEPTION 'Destination table number is required' USING ERRCODE = 'check_violation';
  END IF;

  -- No-op: already on the destination table.
  IF v_old_table_number IS NOT DISTINCT FROM p_new_table_number THEN
    RETURN;
  END IF;

  -- Lock both table sessions in a deterministic (sorted) order so two concurrent
  -- reassigns touching the same pair of tables cannot deadlock. If the order has no
  -- old table, only the destination needs locking.
  IF v_old_table_number IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || p_new_table_number));
  ELSIF v_old_table_number < p_new_table_number THEN
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || v_old_table_number));
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || p_new_table_number));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || p_new_table_number));
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || v_old_table_number));
  END IF;

  -- A reassign always targets a FREE table (the UI only offers free tables). Under
  -- the advisory lock, re-check the destination is still free: if it gained an open
  -- session between the picker load and now (a concurrent order / QR scan), reject
  -- instead of silently merging the moved order onto that other party's check.
  IF EXISTS (
    SELECT 1 FROM table_sessions
    WHERE tenant_id = p_tenant_id
      AND table_number = p_new_table_number
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Destination table is now occupied' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO table_sessions (tenant_id, table_number)
  VALUES (p_tenant_id, p_new_table_number)
  RETURNING id INTO v_new_session_id;

  -- Move the order onto the destination table + session.
  UPDATE orders
    SET table_number = p_new_table_number,
        session_id = v_new_session_id
    WHERE id = p_order_id AND tenant_id = p_tenant_id;

  -- Close the OLD session if nothing unsettled remains on it (mirror of
  -- closeSessionIfFullySettled). The order we just moved no longer references the
  -- old session, so it is excluded from this count.
  IF v_old_session_id IS NOT NULL AND v_old_session_id IS DISTINCT FROM v_new_session_id THEN
    SELECT count(*) INTO v_pending_count
      FROM orders
      WHERE tenant_id = p_tenant_id
        AND session_id = v_old_session_id
        AND payment_status = 'pending'
        AND status <> 'cancelled';

    IF v_pending_count = 0 THEN
      UPDATE table_sessions
        SET status = 'closed', closed_at = now()
        WHERE id = v_old_session_id AND status = 'open';
    END IF;
  END IF;
END;
$$;

-- Grants: same posture as the other report/stock RPCs.
REVOKE EXECUTE ON FUNCTION public.reassign_order_table(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_order_table(uuid, uuid, text) TO authenticated, service_role;
