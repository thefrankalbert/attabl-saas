-- ============================================================
-- STOCK ALERT NOTIFICATIONS — Rate-limited email tracking
-- 2026-02-15
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stock_alert_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('low_stock', 'out_of_stock')),
  sent_to TEXT[] NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for rate-limit lookups (tenant + ingredient + recent time)
CREATE INDEX idx_stock_alerts_rate_limit
  ON public.stock_alert_notifications(tenant_id, ingredient_id, sent_at DESC);

-- RLS
ALTER TABLE public.stock_alert_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_alerts_select ON public.stock_alert_notifications FOR SELECT
  USING (tenant_id IN (SELECT au.tenant_id FROM public.admin_users au WHERE au.user_id = auth.uid()));

-- Insert uses service role (bypasses RLS) since caller may be a customer placing an order
