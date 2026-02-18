-- supabase/migrations/20260218_invitations_permissions.sql
-- Tables, Invitations & Permissions: new tables + column

-- ─── 1. Invitations table ─────────────────────────────────
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'cashier', 'chef', 'waiter')),
  custom_permissions JSONB,
  invited_by UUID NOT NULL REFERENCES admin_users(id),
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ
);

CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_tenant ON invitations(tenant_id);
CREATE INDEX idx_invitations_email ON invitations(email);

-- RLS for invitations
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_admins_can_view_invitations"
  ON invitations FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM admin_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "tenant_admins_can_insert_invitations"
  ON invitations FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM admin_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "tenant_admins_can_update_invitations"
  ON invitations FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM admin_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "service_role_full_access_invitations"
  ON invitations FOR ALL
  USING (auth.role() = 'service_role');

-- ─── 2. Role permissions table ────────────────────────────
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'cashier', 'chef', 'waiter')),
  permissions JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES admin_users(id),
  CONSTRAINT role_permissions_unique UNIQUE (tenant_id, role)
);

-- RLS for role_permissions
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_members_can_view_role_permissions"
  ON role_permissions FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "owner_can_manage_role_permissions"
  ON role_permissions FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM admin_users
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

CREATE POLICY "service_role_full_access_role_permissions"
  ON role_permissions FOR ALL
  USING (auth.role() = 'service_role');

-- ─── 3. Add custom_permissions to admin_users ─────────────
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS custom_permissions JSONB DEFAULT NULL;
