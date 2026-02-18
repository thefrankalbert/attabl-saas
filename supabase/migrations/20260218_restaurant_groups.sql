-- supabase/migrations/20260218_restaurant_groups.sql
-- Multi-Restaurant Owner Hub: restaurant_groups table, RLS, RPC, data migration

-- 1. Create restaurant_groups table
CREATE TABLE restaurant_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Mon Groupe',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_groups_owner_unique UNIQUE (owner_user_id)
);

CREATE INDEX idx_restaurant_groups_owner ON restaurant_groups(owner_user_id);

-- 2. Add group_id to tenants
ALTER TABLE tenants ADD COLUMN group_id uuid REFERENCES restaurant_groups(id) ON DELETE SET NULL;
CREATE INDEX idx_tenants_group_id ON tenants(group_id);

-- 3. RLS on restaurant_groups
ALTER TABLE restaurant_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_can_select_own_group"
  ON restaurant_groups FOR SELECT
  USING (owner_user_id = auth.uid());

CREATE POLICY "owner_can_insert_own_group"
  ON restaurant_groups FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "owner_can_update_own_group"
  ON restaurant_groups FOR UPDATE
  USING (owner_user_id = auth.uid());

CREATE POLICY "service_role_full_access"
  ON restaurant_groups FOR ALL
  USING (auth.role() = 'service_role');

-- 4. Additional tenant policy for group owners
CREATE POLICY "group_owner_can_read_tenants"
  ON tenants FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM restaurant_groups WHERE owner_user_id = auth.uid()
    )
  );

-- 5. RPC: get_owner_dashboard
CREATE OR REPLACE FUNCTION get_owner_dashboard(p_user_id uuid)
RETURNS TABLE(
  tenant_id uuid,
  tenant_name text,
  tenant_slug text,
  tenant_plan text,
  tenant_status text,
  tenant_logo_url text,
  tenant_is_active boolean,
  orders_today bigint,
  revenue_today numeric,
  orders_month bigint,
  revenue_month numeric
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    t.id,
    t.name,
    t.slug,
    t.subscription_plan,
    t.subscription_status,
    t.logo_url,
    t.is_active,
    COUNT(o.id) FILTER (WHERE o.created_at >= CURRENT_DATE),
    COALESCE(SUM(o.total) FILTER (WHERE o.created_at >= CURRENT_DATE), 0),
    COUNT(o.id) FILTER (WHERE o.created_at >= date_trunc('month', CURRENT_DATE)),
    COALESCE(SUM(o.total) FILTER (WHERE o.created_at >= date_trunc('month', CURRENT_DATE)), 0)
  FROM restaurant_groups g
  JOIN tenants t ON t.group_id = g.id
  LEFT JOIN orders o ON o.tenant_id = t.id
  WHERE g.owner_user_id = p_user_id
  GROUP BY t.id, t.name, t.slug, t.subscription_plan, t.subscription_status, t.logo_url, t.is_active
  ORDER BY t.name;
$$;

-- 6. Migrate existing data
INSERT INTO restaurant_groups (owner_user_id, name)
SELECT DISTINCT au.user_id, 'Mon Groupe'
FROM admin_users au
JOIN tenants t ON t.id = au.tenant_id
WHERE t.group_id IS NULL
  AND au.role IN ('owner', 'superadmin')
  AND NOT EXISTS (
    SELECT 1 FROM restaurant_groups rg WHERE rg.owner_user_id = au.user_id
  );

UPDATE tenants t
SET group_id = rg.id
FROM admin_users au
JOIN restaurant_groups rg ON rg.owner_user_id = au.user_id
WHERE t.id = au.tenant_id
  AND t.group_id IS NULL
  AND au.role IN ('owner', 'superadmin');
