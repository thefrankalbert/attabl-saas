-- P2 audit: explicit FK ON DELETE + atomic signup / invitation membership RPCs
-- Skips invitations/role_permissions FK blocks when those tables are absent (remote drift).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'invitations'
  ) THEN
    ALTER TABLE invitations
      DROP CONSTRAINT IF EXISTS invitations_invited_by_fkey;

    ALTER TABLE invitations
      ALTER COLUMN invited_by DROP NOT NULL;

    ALTER TABLE invitations
      ADD CONSTRAINT invitations_invited_by_fkey
      FOREIGN KEY (invited_by) REFERENCES admin_users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'role_permissions'
  ) THEN
    ALTER TABLE role_permissions
      DROP CONSTRAINT IF EXISTS role_permissions_updated_by_fkey;

    ALTER TABLE role_permissions
      ADD CONSTRAINT role_permissions_updated_by_fkey
      FOREIGN KEY (updated_by) REFERENCES admin_users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Atomic tenant provisioning after auth user exists (signup / OAuth)
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
  RETURNING id INTO v_group_id;

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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'invitations'
  ) THEN
    EXECUTE $fn$
CREATE OR REPLACE FUNCTION accept_invitation_membership(
  p_invitation_id uuid,
  p_user_id uuid,
  p_full_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_inv invitations%ROWTYPE;
  v_slug text;
BEGIN
  SELECT * INTO v_inv
  FROM invitations
  WHERE id = p_invitation_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_inv.expires_at < now() THEN
    UPDATE invitations SET status = 'expired' WHERE id = v_inv.id;
    RAISE EXCEPTION 'INVITATION_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO admin_users (
    user_id,
    tenant_id,
    email,
    full_name,
    role,
    is_active,
    custom_permissions,
    created_by
  ) VALUES (
    p_user_id,
    v_inv.tenant_id,
    v_inv.email,
    COALESCE(NULLIF(trim(p_full_name), ''), v_inv.email),
    v_inv.role,
    true,
    v_inv.custom_permissions,
    v_inv.invited_by
  );

  UPDATE invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = v_inv.id;

  SELECT slug INTO v_slug FROM tenants WHERE id = v_inv.tenant_id;

  RETURN jsonb_build_object(
    'tenantId', v_inv.tenant_id,
    'tenantSlug', COALESCE(v_slug, '')
  );
END;
$body$;
$fn$;
  END IF;
END $$;

REVOKE ALL ON FUNCTION provision_signup_tenant(text, text, text, uuid, text, text, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'accept_invitation_membership'
  ) THEN
    REVOKE ALL ON FUNCTION accept_invitation_membership(uuid, uuid, text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION accept_invitation_membership(uuid, uuid, text) TO service_role;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION provision_signup_tenant(text, text, text, uuid, text, text, text) TO service_role;
