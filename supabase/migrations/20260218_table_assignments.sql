-- Table assignments: link servers to tables for shift-based service
CREATE TABLE IF NOT EXISTS table_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  table_id    UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  server_id   UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for active assignment lookups
CREATE INDEX IF NOT EXISTS idx_table_assignments_active
  ON table_assignments(tenant_id, table_id) WHERE (ended_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_table_assignments_server
  ON table_assignments(server_id) WHERE (ended_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_table_assignments_tenant
  ON table_assignments(tenant_id);

-- RLS
ALTER TABLE table_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view assignments"
  ON table_assignments FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant members can insert assignments"
  ON table_assignments FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant members can update assignments"
  ON table_assignments FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()
    )
  );
