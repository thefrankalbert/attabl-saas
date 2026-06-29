-- Atomic "add restaurant to an existing group".
--
-- Problem: addRestaurantToGroup created the tenant, admin_users row and venue in
-- three separate client calls with a manual rollback that can itself fail. A
-- crash between the tenant insert and the admin_users insert leaves a tenant with
-- no owner (an orphan). This RPC wraps the whole creation in one transaction,
-- mirroring provision_signup_tenant, so it is all-or-nothing.
--
-- Behavior is preserved 1:1 with the previous service code (plan -> status/plan
-- mapping, full_name set to the restaurant name, default "main" venue).
-- The tenant name cross-group uniqueness trigger (20260629020000) runs inside the
-- INSERT here too; because group_id is set on the INSERT, same-group reuse is
-- allowed and only cross-group name collisions raise 23505.

CREATE OR REPLACE FUNCTION provision_group_restaurant(
  p_group_id uuid,
  p_user_id uuid,
  p_email text,
  p_name text,
  p_slug text,
  p_type text,
  p_plan text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_owner uuid;
  v_plan text := CASE WHEN p_plan = 'trial' THEN 'starter' ELSE p_plan END;
  v_status text := CASE WHEN p_plan = 'trial' THEN 'trial' ELSE 'pending' END;
  v_trial_ends timestamptz := CASE WHEN p_plan = 'trial' THEN now() + interval '14 days' ELSE NULL END;
BEGIN
  -- Defense in depth: the group must belong to the caller's user.
  SELECT owner_user_id INTO v_owner FROM restaurant_groups WHERE id = p_group_id;
  IF v_owner IS NULL OR v_owner <> p_user_id THEN
    RAISE EXCEPTION 'group_not_owned_by_user' USING ERRCODE = '42501';
  END IF;

  INSERT INTO tenants (
    slug,
    name,
    group_id,
    subscription_plan,
    subscription_status,
    trial_ends_at,
    is_active
  ) VALUES (
    p_slug,
    p_name,
    p_group_id,
    v_plan,
    v_status,
    v_trial_ends,
    true
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO admin_users (
    tenant_id,
    user_id,
    email,
    full_name,
    role,
    is_active
  ) VALUES (
    v_tenant_id,
    p_user_id,
    p_email,
    p_name,
    'owner',
    true
  );

  INSERT INTO venues (tenant_id, slug, name, name_en, type, is_active)
  VALUES (v_tenant_id, 'main', 'Salle principale', 'Main Dining', p_type, true);

  RETURN jsonb_build_object(
    'tenantId', v_tenant_id,
    'slug', p_slug
  );
END;
$$;

REVOKE ALL ON FUNCTION provision_group_restaurant(uuid, uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION provision_group_restaurant(uuid, uuid, text, text, text, text, text) TO service_role;
