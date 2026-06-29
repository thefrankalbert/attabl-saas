-- Auditable coupon redemptions (audit finding H11).
--
-- Coupon usage was a bare counter (coupons.current_uses++) with no record of
-- WHICH order/customer redeemed WHICH coupon, so per-customer caps and any audit
-- were impossible. This adds an append-only redemptions table written when a
-- coupon is claimed for an order. The counter (claim/unclaim_coupon_usage) stays
-- as the enforcement mechanism; this table is the audit trail.
--
-- APPLY TO PROD BACKUP-FIRST. Additive (new table + policies), nothing removed.

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Keep the redemption record even if the coupon is later deleted.
  coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL,
  -- An order's redemption disappears only if the (unpaid) order itself is deleted.
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  discount_amount numeric(10, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_tenant_coupon
  ON public.coupon_redemptions (tenant_id, coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_order
  ON public.coupon_redemptions (order_id);

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

-- Tenant members can read their redemptions. Writes go through the server-side
-- order path (service_role), so no anon/authenticated INSERT policy is granted.
DROP POLICY IF EXISTS "coupon_redemptions_tenant_select" ON public.coupon_redemptions;
CREATE POLICY "coupon_redemptions_tenant_select" ON public.coupon_redemptions
  FOR SELECT TO authenticated
  USING (tenant_id = ANY (public.get_my_tenant_ids_array()));

GRANT SELECT ON TABLE public.coupon_redemptions TO authenticated;
GRANT ALL ON TABLE public.coupon_redemptions TO service_role;
