-- supabase/migrations/20260703200000_comp_order_notes_house_account.sql
-- Phase 8: comp/offert (#20) + manager note / house account ardoise (#19).
-- Additive only (new columns, new payment_status value, 2 tables, 2 SECDEF RPCs).
-- APPLY TO PROD BACKUP-FIRST. Do NOT redefine assert_tenant_member /
-- get_my_tenant_ids_array here - only reference them.

-- 1. orders: comp columns + house account link (additive)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_comp      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS comp_reason  text,
  ADD COLUMN IF NOT EXISTS comped_by    uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS comped_at    timestamptz,
  ADD COLUMN IF NOT EXISTS comp_amount  bigint,
  ADD COLUMN IF NOT EXISTS house_account_id uuid;

-- 2. widen payment_status to include 'comp' (offered orders are closed but NOT paid,
--    so they stay excluded from get_daily_revenue/get_order_summary/get_top_items
--    which all filter payment_status='paid')
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending','paid','partial','refunded','comp'));

-- 3. house_accounts (ardoise / running tab)
CREATE TABLE IF NOT EXISTS public.house_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','settled')),
  created_by  uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  settled_at  timestamptz,
  settled_by  uuid REFERENCES public.admin_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_house_accounts_tenant        ON public.house_accounts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_house_accounts_tenant_status ON public.house_accounts (tenant_id, status);

-- FK from orders now that house_accounts exists
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_house_account_id_fkey,
  ADD CONSTRAINT orders_house_account_id_fkey
    FOREIGN KEY (house_account_id) REFERENCES public.house_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_house_account
  ON public.orders (tenant_id, house_account_id) WHERE house_account_id IS NOT NULL;

ALTER TABLE public.house_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "house_accounts_tenant_select" ON public.house_accounts;
CREATE POLICY "house_accounts_tenant_select" ON public.house_accounts
  FOR SELECT TO authenticated USING (tenant_id = ANY (public.get_my_tenant_ids_array()));
DROP POLICY IF EXISTS "house_accounts_tenant_insert" ON public.house_accounts;
CREATE POLICY "house_accounts_tenant_insert" ON public.house_accounts
  FOR INSERT TO authenticated WITH CHECK (tenant_id = ANY (public.get_my_tenant_ids_array()));
DROP POLICY IF EXISTS "house_accounts_tenant_update" ON public.house_accounts;
CREATE POLICY "house_accounts_tenant_update" ON public.house_accounts
  FOR UPDATE TO authenticated
  USING (tenant_id = ANY (public.get_my_tenant_ids_array()))
  WITH CHECK (tenant_id = ANY (public.get_my_tenant_ids_array()));
DROP POLICY IF EXISTS "house_accounts_tenant_delete" ON public.house_accounts;
CREATE POLICY "house_accounts_tenant_delete" ON public.house_accounts
  FOR DELETE TO authenticated USING (tenant_id = ANY (public.get_my_tenant_ids_array()));
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.house_accounts TO authenticated;
GRANT ALL ON TABLE public.house_accounts TO service_role;

-- 4. order_notes (manager annotations, append-only, records who left the note)
CREATE TABLE IF NOT EXISTS public.order_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id   uuid NOT NULL REFERENCES public.orders(id)  ON DELETE CASCADE,
  note       text NOT NULL,
  created_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_notes_tenant_order ON public.order_notes (tenant_id, order_id);
ALTER TABLE public.order_notes ENABLE ROW LEVEL SECURITY;
-- append-only: SELECT + INSERT only (no UPDATE/DELETE -> audit trail preserved)
DROP POLICY IF EXISTS "order_notes_tenant_select" ON public.order_notes;
CREATE POLICY "order_notes_tenant_select" ON public.order_notes
  FOR SELECT TO authenticated USING (tenant_id = ANY (public.get_my_tenant_ids_array()));
DROP POLICY IF EXISTS "order_notes_tenant_insert" ON public.order_notes;
CREATE POLICY "order_notes_tenant_insert" ON public.order_notes
  FOR INSERT TO authenticated WITH CHECK (tenant_id = ANY (public.get_my_tenant_ids_array()));
GRANT SELECT, INSERT ON TABLE public.order_notes TO authenticated;
GRANT ALL ON TABLE public.order_notes TO service_role;

-- 5. RPC: daily comps report (offered value, kept OUT of revenue)
CREATE OR REPLACE FUNCTION public.get_daily_comps(
  p_tenant_id uuid, p_start_date timestamptz, p_end_date timestamptz
) RETURNS TABLE (day date, comp_total bigint, comp_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT DATE(o.comped_at) AS day,
         COALESCE(SUM(o.comp_amount),0)::bigint AS comp_total,
         COUNT(o.id)::bigint AS comp_count
  FROM orders o
  WHERE o.tenant_id = p_tenant_id
    AND o.is_comp = true
    AND o.comped_at >= p_start_date AND o.comped_at <= p_end_date
  GROUP BY DATE(o.comped_at)
  ORDER BY day ASC;
END; $$;
REVOKE ALL ON FUNCTION public.get_daily_comps(uuid,timestamptz,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_daily_comps(uuid,timestamptz,timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_daily_comps(uuid,timestamptz,timestamptz) TO authenticated, service_role;

-- 6. RPC: house account outstanding balances (running tab: due - ledger net)
CREATE OR REPLACE FUNCTION public.get_house_account_balances(p_tenant_id uuid)
RETURNS TABLE (account_id uuid, name text, status text, open_orders bigint, outstanding bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT ha.id, ha.name, ha.status,
    COUNT(o.id) FILTER (
      WHERE o.payment_status NOT IN ('paid','comp') AND o.status <> 'cancelled'
    )::bigint AS open_orders,
    COALESCE(SUM(
      CASE WHEN o.payment_status NOT IN ('paid','comp') AND o.status <> 'cancelled'
        THEN (o.total + COALESCE(o.tip_amount,0))
             - COALESCE((SELECT SUM(CASE WHEN p.status='refunded' THEN -p.amount ELSE p.amount END)
                         FROM payments p WHERE p.order_id = o.id), 0)
        ELSE 0 END), 0)::bigint AS outstanding
  FROM house_accounts ha
  LEFT JOIN orders o ON o.house_account_id = ha.id AND o.tenant_id = ha.tenant_id
  WHERE ha.tenant_id = p_tenant_id
  GROUP BY ha.id, ha.name, ha.status, ha.created_at
  ORDER BY ha.created_at DESC;
END; $$;
REVOKE ALL ON FUNCTION public.get_house_account_balances(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_house_account_balances(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_house_account_balances(uuid) TO authenticated, service_role;
