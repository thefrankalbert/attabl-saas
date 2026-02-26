-- Audit log table for tracking all critical mutations
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  user_role TEXT,
  action TEXT NOT NULL,          -- 'create', 'update', 'delete'
  entity_type TEXT NOT NULL,     -- 'order', 'menu', 'item', 'user', 'permission', 'setting', 'ingredient'
  entity_id UUID,
  old_data JSONB,
  new_data JSONB,
  metadata JSONB                 -- ip, device, etc.
);

-- Indexes for fast queries
CREATE INDEX idx_audit_log_tenant ON audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);

-- RLS: only owner/admin/manager of the tenant can read
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit logs" ON audit_log
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM admin_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')
    )
  );

-- Insert policy: any authenticated admin_user of the tenant can insert
CREATE POLICY "Admins can insert audit logs" ON audit_log
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM admin_users
      WHERE user_id = auth.uid()
    )
  );
