-- Payments / tenders ledger (audit findings H2 + H8).
--
-- Payment state was a single mutable enum on orders (payment_status), overwritten
-- in place, with no record of WHO took WHAT amount WHEN: no split tender, no
-- partial/refund history, no cash-handling audit trail (the #1 fraud surface in a
-- restaurant). This adds an append-only tender table. Each settlement writes one
-- payment row; refunds will be offsetting rows (never mutating a settled one).
-- payment_status stays as the fast flag for now; deriving it fully from the sum of
-- tenders is a later step once split/partial lands.
--
-- APPLY TO PROD BACKUP-FIRST. Additive (new table + policies), nothing removed.

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  amount numeric(10, 2) NOT NULL,
  method text NOT NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'refunded')),
  created_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_tenant_order ON public.payments (tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments (order_id);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Tenant members can read their ledger and append tenders (markPaid runs as the
-- authenticated staff client). No UPDATE/DELETE policy: the ledger is append-only.
DROP POLICY IF EXISTS "payments_tenant_select" ON public.payments;
CREATE POLICY "payments_tenant_select" ON public.payments
  FOR SELECT TO authenticated
  USING (tenant_id = ANY (public.get_my_tenant_ids_array()));

DROP POLICY IF EXISTS "payments_tenant_insert" ON public.payments;
CREATE POLICY "payments_tenant_insert" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ANY (public.get_my_tenant_ids_array()));

GRANT SELECT, INSERT ON TABLE public.payments TO authenticated;
GRANT ALL ON TABLE public.payments TO service_role;
