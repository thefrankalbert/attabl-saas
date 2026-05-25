-- Service floor: table_assignments + orders.table_id (may be missing on remote drift)

CREATE TABLE IF NOT EXISTS table_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  table_id    UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  server_id   UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_table_assignments_active
  ON table_assignments(tenant_id, table_id) WHERE (ended_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_table_assignments_server
  ON table_assignments(server_id) WHERE (ended_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_table_assignments_tenant
  ON table_assignments(tenant_id);

ALTER TABLE table_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can view assignments" ON table_assignments;
CREATE POLICY "Tenant members can view assignments"
  ON table_assignments FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Tenant members can insert assignments" ON table_assignments;
CREATE POLICY "Tenant members can insert assignments"
  ON table_assignments FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Tenant members can update assignments" ON table_assignments;
CREATE POLICY "Tenant members can update assignments"
  ON table_assignments FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Tenant members can delete assignments" ON table_assignments;
CREATE POLICY "Tenant members can delete assignments"
  ON table_assignments FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()
    )
  );

ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES tables(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id) WHERE table_id IS NOT NULL;

UPDATE orders o
SET table_id = t.id
FROM tables t
INNER JOIN zones z ON z.id = t.zone_id
INNER JOIN venues v ON v.id = z.venue_id
WHERE o.tenant_id = v.tenant_id
  AND o.table_id IS NULL
  AND (
    o.table_number = t.table_number
    OR o.table_number = t.display_name
  );
