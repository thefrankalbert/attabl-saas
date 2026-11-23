-- ============================================================================
-- reassign_order_table: regle de fermeture et droit (revue L014, A14 + A15).
-- ============================================================================
--
-- A14. Apres le deplacement, l'ancienne session etait fermee s'il ne restait
-- aucune commande `pending`. Une commande `partial` (acompte pris, solde du) ne
-- comptait pas: la table apparaissait libre avec une addition ouverte. La regle
-- est alignee sur close_table_session_if_settled (20261115200000): impayee,
-- partiellement payee ou pas encore servie (sauf commande de plus de 2 h)
-- = table occupee. Verifie en production le 2026-11-21: corps stocke sans
-- 'partial'.
--
-- A15. La fonction ne verifiait que l'appartenance (assert_tenant_member),
-- alors que l'action exige `orders.manage`; EXECUTE est accorde a
-- authenticated, donc un membre sans ce droit deplacait une commande par l'API
-- directe. Ajout du meme controle que close_table_session_if_settled
-- (has_tenant_write_permission, service_role exempte). Le super administrateur
-- (public.is_super_admin(), revoque = plus super administrateur depuis
-- 20261112210000) reste admis, comme dans l'action (get-session.ts, qui le
-- traite en proprietaire virtuel) et comme dans assert_tenant_member.
--
-- Corps repris de 20260711140000_reassign_order_table.sql (seule definition du
-- depot, identique au corps stocke de supabase/schema.sql). Seuls les deux
-- blocs marques A14 et A15 changent. Signature et droits inchanges.
--
-- Rollback: rejouer le CREATE OR REPLACE FUNCTION de
-- 20260711140000_reassign_order_table.sql.
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

  -- A15: meme droit que l'action serveur (`orders.manage`). Sans ce controle,
  -- un membre sans ce droit deplacait une commande par l'API directe.
  IF coalesce(auth.role(), '') <> 'service_role'
     AND NOT public.is_super_admin()
     AND NOT public.has_tenant_write_permission(p_tenant_id, 'orders.manage') THEN
    RAISE EXCEPTION 'access denied: reassigning an order requires orders.manage'
      USING ERRCODE = '42501';
  END IF;

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

  -- Close the OLD session if nothing unsettled remains on it. A14: meme regle
  -- que close_table_session_if_settled (20261115200000, p_require_served = true,
  -- delai de 2 h): une commande impayee OU partiellement payee, ou pas encore
  -- servie, garde la table occupee. L'ancienne regle ne comptait que 'pending':
  -- un acompte laissait la table liberee avec une addition ouverte. The order we
  -- just moved no longer references the old session, so it is excluded.
  IF v_old_session_id IS NOT NULL AND v_old_session_id IS DISTINCT FROM v_new_session_id THEN
    SELECT count(*) INTO v_pending_count
      FROM orders
      WHERE tenant_id = p_tenant_id
        AND session_id = v_old_session_id
        AND status <> 'cancelled'
        AND (
          coalesce(payment_status, 'pending') IN ('pending', 'partial')
          OR (
            status NOT IN ('delivered', 'served')
            AND created_at > now() - interval '2 hours'
          )
        );

    IF v_pending_count = 0 THEN
      UPDATE table_sessions
        SET status = 'closed', closed_at = now()
        WHERE id = v_old_session_id AND status = 'open';
    END IF;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reassign_order_table(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_order_table(uuid, uuid, text) TO authenticated, service_role;
