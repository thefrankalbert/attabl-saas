-- Repair: remote DB may have provision_signup_tenant without restaurant_groups (migration drift).
-- Idempotent: safe to run when 20260218000001 was skipped or partially applied.

CREATE TABLE IF NOT EXISTS restaurant_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Mon Groupe',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_groups_owner_unique UNIQUE (owner_user_id)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_groups_owner ON restaurant_groups(owner_user_id);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES restaurant_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_group_id ON tenants(group_id);

ALTER TABLE restaurant_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_can_select_own_group" ON restaurant_groups;
CREATE POLICY "owner_can_select_own_group"
  ON restaurant_groups FOR SELECT
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "owner_can_insert_own_group" ON restaurant_groups;
CREATE POLICY "owner_can_insert_own_group"
  ON restaurant_groups FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "owner_can_update_own_group" ON restaurant_groups;
CREATE POLICY "owner_can_update_own_group"
  ON restaurant_groups FOR UPDATE
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "service_role_full_access" ON restaurant_groups;
CREATE POLICY "service_role_full_access"
  ON restaurant_groups FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "group_owner_can_read_tenants" ON tenants;
CREATE POLICY "group_owner_can_read_tenants"
  ON tenants FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM restaurant_groups WHERE owner_user_id = auth.uid()
    )
  );

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
) LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
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

CREATE OR REPLACE FUNCTION provision_signup_tenant(
  p_slug text,
  p_name text,
  p_plan text,
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_group_id uuid;
  v_trial_ends timestamptz := now() + interval '14 days';
BEGIN
  INSERT INTO tenants (
    slug,
    name,
    subscription_plan,
    subscription_status,
    trial_ends_at,
    is_active
  ) VALUES (
    p_slug,
    p_name,
    p_plan,
    'trial',
    v_trial_ends,
    true
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO restaurant_groups (owner_user_id, name)
  VALUES (p_user_id, 'Mon Groupe')
  ON CONFLICT (owner_user_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_group_id;

  IF v_group_id IS NULL THEN
    SELECT id INTO v_group_id FROM restaurant_groups WHERE owner_user_id = p_user_id;
  END IF;

  UPDATE tenants
  SET group_id = v_group_id
  WHERE id = v_tenant_id;

  INSERT INTO admin_users (
    tenant_id,
    user_id,
    email,
    full_name,
    phone,
    role,
    is_active
  ) VALUES (
    v_tenant_id,
    p_user_id,
    p_email,
    p_full_name,
    p_phone,
    'owner',
    true
  );

  INSERT INTO venues (tenant_id, slug, name, name_en, type, is_active)
  VALUES (v_tenant_id, 'main', 'Salle principale', 'Main Dining', 'restaurant', true);

  RETURN jsonb_build_object(
    'tenantId', v_tenant_id,
    'slug', p_slug,
    'groupId', v_group_id
  );
END;
$$;

REVOKE ALL ON FUNCTION provision_signup_tenant(text, text, text, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION provision_signup_tenant(text, text, text, uuid, text, text, text) TO service_role;
