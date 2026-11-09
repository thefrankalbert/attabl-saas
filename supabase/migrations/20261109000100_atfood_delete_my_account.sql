-- NOT YET APPLIED. Self-service account deletion for the Atfood iOS app (App Store guideline 5.1.1(v)).
-- Returns a status code instead of raising, so the app can explain every refusal.
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_blocking_tenant text;
  m record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'not_authenticated';
  END IF;

  -- Platform operators are never deleted from a tenant app.
  IF EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_uid AND (is_super_admin IS TRUE OR role = 'super_admin')) THEN
    RETURN 'platform_account';
  END IF;

  -- Owner of a restaurant group: the group would cascade-delete.
  IF EXISTS (SELECT 1 FROM restaurant_groups WHERE owner_user_id = v_uid) THEN
    RETURN 'group_owner';
  END IF;

  -- Sole active owner of a live restaurant: deleting would orphan (or wipe) the restaurant.
  SELECT t.name INTO v_blocking_tenant
  FROM admin_users au
  JOIN tenants t ON t.id = au.tenant_id
  WHERE au.user_id = v_uid AND au.role = 'owner' AND t.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM admin_users o
      WHERE o.tenant_id = au.tenant_id AND o.user_id <> v_uid AND o.role = 'owner'
        AND o.is_active IS TRUE AND o.deleted_at IS NULL
    )
  LIMIT 1;
  IF v_blocking_tenant IS NOT NULL THEN
    RETURN 'sole_owner:' || v_blocking_tenant;
  END IF;

  -- Leave every restaurant the way the web removes a member (delete_admin_user_atomic, else-branch).
  FOR m IN SELECT id, tenant_id FROM admin_users WHERE user_id = v_uid LOOP
    UPDATE admin_users SET created_by = NULL WHERE created_by = m.id AND tenant_id = m.tenant_id;
    UPDATE role_permissions SET updated_by = NULL WHERE updated_by = m.id AND tenant_id = m.tenant_id;
    UPDATE invitations SET invited_by = (
      SELECT id FROM admin_users
      WHERE tenant_id = m.tenant_id AND id <> m.id
      ORDER BY is_active DESC, (role = 'owner') DESC, created_at ASC
      LIMIT 1
    ) WHERE invited_by = m.id AND tenant_id = m.tenant_id;
    DELETE FROM admin_users WHERE id = m.id;
  END LOOP;

  -- References without ON DELETE: keep the restaurant's data, drop the link to the person.
  UPDATE menu_items SET image_uploaded_by = NULL WHERE image_uploaded_by = v_uid;
  UPDATE ai_credits_ledger SET user_id = NULL WHERE user_id = v_uid;
  DELETE FROM dish_photo_drafts WHERE created_by = v_uid;   -- the app removes their files first

  BEGIN
    DELETE FROM auth.users WHERE id = v_uid;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'account_deletion_blocked' USING ERRCODE = 'P0001';   -- rolls everything back
  END;
  RETURN 'deleted';
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
