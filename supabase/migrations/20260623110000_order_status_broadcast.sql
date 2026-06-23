-- Security fix (L-1 / N-2 full closure): move anonymous order-status realtime from
-- postgres_changes to Realtime Broadcast, then remove the last anon table read on orders.
--
-- WHY: postgres_changes delivers the FULL changed row to subscribers; Supabase does NOT
-- apply column-level grants to the realtime payload, so anon subscribers received every
-- column (including PII: customer_name, customer_phone, delivery_address, room_number,
-- notes) of recently-updated orders, even though those columns are revoked from anon at
-- the REST/column level (20260506155500). 20260623100000 bounded this to a 6h window but
-- did not close it. Broadcast lets the database emit a controlled, non-PII payload
-- ({ id, status }) on a public topic, so anon needs no table SELECT on orders at all.
--
-- The customer read path already goes through get_orders_for_tracking (20260623100000),
-- so once realtime uses Broadcast we can drop the residual bounded anon SELECT entirely.
-- Admin/kitchen realtime (authenticated) keeps using postgres_changes via the
-- authenticated SELECT policy and the supabase_realtime publication - unaffected.
--
-- Rollback: DROP TRIGGER trg_broadcast_order_status; DROP FUNCTION broadcast_order_status();
-- and re-create the anon SELECT policy on orders as FOR SELECT TO anon
-- USING (created_at > now() - interval '6 hours').

-- 1. Broadcast a non-PII status payload on status change, to a public per-order topic
-- (order:<id>, used by the order-confirmed page) and a public per-tenant topic
-- (tenant-orders:<tenant_id>, used by ClientOrders). private => false so anonymous
-- customers can subscribe without a realtime.messages RLS policy.
CREATE OR REPLACE FUNCTION public.broadcast_order_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Broadcast is strictly best-effort: a realtime failure must NEVER roll back the
  -- order status UPDATE (this trigger sits on the core kitchen/admin order flow).
  BEGIN
    PERFORM realtime.send(
      jsonb_build_object('id', NEW.id, 'status', NEW.status),
      'status',
      'order:' || NEW.id::text,
      false
    );
    PERFORM realtime.send(
      jsonb_build_object('id', NEW.id, 'status', NEW.status),
      'status',
      'tenant-orders:' || NEW.tenant_id::text,
      false
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- swallow: never block an order status update on a broadcast failure
      NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_order_status ON public.orders;
CREATE TRIGGER trg_broadcast_order_status
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.broadcast_order_status();

-- 2. Anon no longer needs ANY table read on orders: reads go through
-- get_orders_for_tracking, live status via Broadcast. Drop the residual bounded
-- anon SELECT (this removes the full-row realtime PII exposure to anon).
DROP POLICY IF EXISTS "Orders are anon-readable for active tracking" ON "public"."orders";
