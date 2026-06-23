-- Hardening: scope order-status Broadcast to per-order topics only.
--
-- 20260623110000 broadcast to both order:<id> (per-order, used by order-confirmed)
-- and tenant-orders:<tenant_id> (per-tenant, used by ClientOrders). The per-tenant
-- topic let any anonymous client that knew a tenant_id subscribe and observe the
-- full {id, status} stream of every order in that tenant (non-PII, but an
-- unnecessary order-activity side channel). ClientOrders now subscribes to the
-- per-order topics for the order ids it already holds, so the tenant-wide send is
-- no longer needed and is removed. An anonymous client can now only receive a
-- broadcast for an order whose unguessable id it already possesses.
--
-- Still best-effort (EXCEPTION-wrapped): a realtime failure never rolls back the
-- order status UPDATE on the core kitchen/admin flow.
--
-- Apply order: deploy the ClientOrders per-order subscription FIRST, then this
-- migration (it removes a topic the previously-deployed ClientOrders subscribed to).
--
-- Rollback: re-add the second PERFORM realtime.send(..., 'tenant-orders:' || NEW.tenant_id::text, false).
CREATE OR REPLACE FUNCTION public.broadcast_order_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Best-effort: never block an order status update on a broadcast failure.
  BEGIN
    PERFORM realtime.send(
      jsonb_build_object('id', NEW.id, 'status', NEW.status),
      'status',
      'order:' || NEW.id::text,
      false
    );
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;
  RETURN NEW;
END;
$$;
