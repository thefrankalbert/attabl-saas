-- QR designs: persist per-tenant QR card designs and assign a distinct design
-- to a zone or an individual table. Resolution order (applied in the service,
-- not SQL): table.qr_design_id -> zone.qr_design_id -> tenant default -> factory.
--
-- Additive migration: creates one table + two nullable FK columns. No drops.
-- The unused tables.qr_code_url column is intentionally left in place; its
-- removal is a separate access-removing migration to run after the client code
-- stops referencing it.

CREATE TABLE IF NOT EXISTS qr_designs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  config      JSONB NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qr_designs_tenant ON qr_designs(tenant_id);

-- At most one default design per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_designs_one_default
  ON qr_designs(tenant_id) WHERE (is_default = true);

-- Assignment columns: a zone or a table may point at a saved design.
-- ON DELETE SET NULL so deleting a design never cascade-deletes tables/zones.
ALTER TABLE tables
  ADD COLUMN IF NOT EXISTS qr_design_id UUID REFERENCES qr_designs(id) ON DELETE SET NULL;
ALTER TABLE zones
  ADD COLUMN IF NOT EXISTS qr_design_id UUID REFERENCES qr_designs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tables_qr_design ON tables(qr_design_id);
CREATE INDEX IF NOT EXISTS idx_zones_qr_design ON zones(qr_design_id);

-- RLS: tenant members (any admin_users row for the tenant) manage their designs.
ALTER TABLE qr_designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view qr designs"
  ON qr_designs FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM admin_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Tenant members can insert qr designs"
  ON qr_designs FOR INSERT
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM admin_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Tenant members can update qr designs"
  ON qr_designs FOR UPDATE
  USING (
    tenant_id IN (SELECT tenant_id FROM admin_users WHERE user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM admin_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Tenant members can delete qr designs"
  ON qr_designs FOR DELETE
  USING (
    tenant_id IN (SELECT tenant_id FROM admin_users WHERE user_id = auth.uid())
  );

-- Keep updated_at fresh on every write.
CREATE OR REPLACE FUNCTION set_qr_designs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_qr_designs_updated_at
  BEFORE UPDATE ON qr_designs
  FOR EACH ROW
  EXECUTE FUNCTION set_qr_designs_updated_at();
