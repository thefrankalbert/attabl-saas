-- Cascade-delete the tenant when its LAST member is removed.
--
-- Previously delete_admin_user_atomic only removed the admin_users row and (if
-- the user had no other memberships) the auth.users row. It NEVER deleted the
-- tenant, so deleting the last member left an orphaned tenant plus all of its
-- children stranded in the database.
--
-- New behaviour (product decision: "Cascade - tout supprimer"):
--   * Removing a member who is NOT the last one -> remove that collaborator.
--     Their dangling actor references (NO ACTION FKs that would otherwise block
--     the delete) are cleared first: admin_users.created_by / role_permissions.
--     updated_by set NULL, and pending invitations they created are cancelled.
--   * Removing the LAST member of a tenant -> delete the TENANT (not the member
--     row first). Deleting the tenant cascades admin_users + invitations +
--     role_permissions + menu_items + ... in a SINGLE statement, so the
--     self/actor NO ACTION FKs (created_by / invited_by / updated_by) are
--     satisfied at statement end. The ONLY RESTRICT edge in the schema,
--     order_items.menu_item_id -> menu_items, is cleared first by deleting the
--     tenant's order_items (order_items is scoped via orders, no tenant_id).
--   * The auth.users row is removed when the user has no memberships left
--     anywhere - EXCEPT when the user still owns a restaurant_group that has
--     other tenants (deleting the user would CASCADE-drop that group and SET
--     NULL its tenants' group_id - a silent cross-tenant side effect), or when
--     the auth row is still referenced by other NO ACTION FKs.
--
-- Concurrency: a tenant-row lock (FOR UPDATE) serializes concurrent member
-- deletions on the same tenant so two "last member" deletions cannot race.
--
-- SECURITY DEFINER + SET search_path = public are preserved (CREATE OR REPLACE
-- resets configuration params that are not restated). EXECUTE stays granted to
-- service_role only; the function is only called from the backend after a
-- permission check (actionDeleteAdminUser).
CREATE OR REPLACE FUNCTION public.delete_admin_user_atomic(
  p_admin_user_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_group_id UUID;
  tenant_members_total INT;
  user_memberships_remaining INT;
  group_tenants_remaining INT;
BEGIN
  -- Resolve the tenant of the membership being removed.
  SELECT tenant_id INTO v_tenant_id
  FROM admin_users
  WHERE id = p_admin_user_id;

  IF v_tenant_id IS NULL THEN
    RETURN FALSE; -- membership already gone / bad id
  END IF;

  -- Serialize concurrent member deletions for this tenant on the tenant row.
  PERFORM 1 FROM tenants WHERE id = v_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN FALSE; -- tenant vanished (concurrent last-member delete)
  END IF;

  -- Re-verify the target membership still exists under the lock.
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE id = p_admin_user_id) THEN
    RETURN FALSE;
  END IF;

  SELECT group_id INTO v_group_id FROM tenants WHERE id = v_tenant_id;

  SELECT COUNT(*) INTO tenant_members_total
  FROM admin_users
  WHERE tenant_id = v_tenant_id;

  IF tenant_members_total <= 1 THEN
    -- LAST member -> cascade-delete the whole tenant.
    -- Clear the only RESTRICT edge first (order_items.menu_item_id); order_items
    -- has no tenant_id, it is scoped through its order.
    DELETE FROM order_items
    WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = v_tenant_id);

    -- One statement cascades admin_users + invitations + role_permissions +
    -- menu_items + categories + venues + onboarding_progress + orders + ... ,
    -- so the NO ACTION self/actor FKs are satisfied at statement end.
    DELETE FROM tenants WHERE id = v_tenant_id;

    -- Drop the restaurant group if it no longer owns any tenant.
    IF v_group_id IS NOT NULL THEN
      SELECT COUNT(*) INTO group_tenants_remaining
      FROM tenants
      WHERE group_id = v_group_id;

      IF group_tenants_remaining = 0 THEN
        DELETE FROM restaurant_groups WHERE id = v_group_id;
      END IF;
    END IF;
  ELSE
    -- NOT the last member -> remove just this collaborator. The actor-reference
    -- FKs to admin_users(id) are NO ACTION, so a row still pointing at this
    -- member would block the delete. Clear/reassign them, ALL scoped to this
    -- tenant (belt-and-suspenders against any cross-tenant created_by drift).
    UPDATE admin_users SET created_by = NULL
      WHERE created_by = p_admin_user_id AND tenant_id = v_tenant_id;
    UPDATE role_permissions SET updated_by = NULL
      WHERE updated_by = p_admin_user_id AND tenant_id = v_tenant_id;
    -- invitations.invited_by on the LIVE database is NOT NULL + NO ACTION (the
    -- 20260519 migration that intended ON DELETE SET NULL was never materialized
    -- in prod). So a row pointing at the departing member blocks the delete and
    -- the column cannot be nulled. Reassign to a surviving member (prefer an
    -- ACTIVE owner) so invitation history is PRESERVED. A surviving member always
    -- exists on the non-last path, so the subquery never returns NULL. This is
    -- also safe if the FK ever becomes ON DELETE SET NULL (the reassignment just
    -- runs before the FK action would).
    UPDATE invitations SET invited_by = (
      SELECT id FROM admin_users
      WHERE tenant_id = v_tenant_id AND id <> p_admin_user_id
      ORDER BY is_active DESC, (role = 'owner') DESC, created_at ASC
      LIMIT 1
    )
    WHERE invited_by = p_admin_user_id AND tenant_id = v_tenant_id;
    DELETE FROM admin_users WHERE id = p_admin_user_id;
  END IF;

  -- Remove the auth user if they have no memberships left anywhere.
  SELECT COUNT(*) INTO user_memberships_remaining
  FROM admin_users
  WHERE user_id = p_user_id;

  IF user_memberships_remaining = 0 THEN
    -- Do NOT delete the auth user if they still own a restaurant_group that has
    -- other tenants: auth.users deletion CASCADE-drops the group (owner_user_id
    -- ON DELETE CASCADE) and SET NULLs those tenants' group_id - a silent
    -- cross-tenant effect. Keep the (membership-less) auth row in that case.
    IF EXISTS (
      SELECT 1
      FROM restaurant_groups g
      JOIN tenants t ON t.group_id = g.id
      WHERE g.owner_user_id = p_user_id
    ) THEN
      RETURN FALSE;
    END IF;

    -- Best-effort: a NO ACTION FK from a surviving tenant (e.g.
    -- menu_items.image_uploaded_by, *_ledger.user_id) can still reference this
    -- auth user. Do not let that roll back the successful tenant/member delete.
    BEGIN
      DELETE FROM auth.users WHERE id = p_user_id;
      RETURN TRUE; -- auth user was deleted
    EXCEPTION WHEN foreign_key_violation THEN
      RETURN FALSE; -- still referenced elsewhere; keep the auth row
    END;
  END IF;

  RETURN FALSE; -- auth user kept (has other memberships)
END;
$$;

-- Re-assert least-privilege EXECUTE (CREATE OR REPLACE preserves grants, but be
-- explicit and idempotent so the hardening survives a fresh apply).
REVOKE ALL ON FUNCTION public.delete_admin_user_atomic(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_admin_user_atomic(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_admin_user_atomic(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_admin_user_atomic(uuid, uuid) TO service_role;
