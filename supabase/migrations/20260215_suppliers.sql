-- ============================================================
-- SUPPLIERS MODULE — Tables, RLS, Indexes
-- 2026-02-15
-- ============================================================

-- ─── 1. SUPPLIERS TABLE ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone VARCHAR(50),
  email TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_suppliers_tenant ON public.suppliers(tenant_id);
CREATE INDEX idx_suppliers_active ON public.suppliers(tenant_id, is_active);

-- ─── 2. ADD supplier_id TO stock_movements ────────────────

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX idx_stock_movements_supplier ON public.stock_movements(supplier_id)
  WHERE supplier_id IS NOT NULL;

-- ─── 3. AUTO-UPDATE updated_at TRIGGER ────────────────────

CREATE OR REPLACE FUNCTION public.update_suppliers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_suppliers_updated_at();

-- ─── 4. RLS POLICIES ─────────────────────────────────────

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY suppliers_select ON public.suppliers FOR SELECT
  USING (tenant_id IN (SELECT au.tenant_id FROM public.admin_users au WHERE au.user_id = auth.uid()));
CREATE POLICY suppliers_insert ON public.suppliers FOR INSERT
  WITH CHECK (tenant_id IN (SELECT au.tenant_id FROM public.admin_users au WHERE au.user_id = auth.uid()));
CREATE POLICY suppliers_update ON public.suppliers FOR UPDATE
  USING (tenant_id IN (SELECT au.tenant_id FROM public.admin_users au WHERE au.user_id = auth.uid()));
CREATE POLICY suppliers_delete ON public.suppliers FOR DELETE
  USING (tenant_id IN (SELECT au.tenant_id FROM public.admin_users au WHERE au.user_id = auth.uid()));
