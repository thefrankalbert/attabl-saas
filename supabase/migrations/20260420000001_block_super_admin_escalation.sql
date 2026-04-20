-- CRITICAL SECURITY FIX: Block super_admin privilege escalation via admin_users RLS.
--
-- Before this migration:
--   The policy "Admins can manage own tenant admins" is ALL command with
--   USING = (tenant_id = ANY(get_my_tenant_ids_array())) and no WITH CHECK.
--   Postgres falls back to USING for the WITH CHECK on INSERT/UPDATE, which
--   only validates tenant_id membership. It does NOT restrict which columns
--   (including is_super_admin or role) the actor may set.
--
--   As a result, any tenant admin could:
--     INSERT INTO admin_users (user_id, tenant_id, is_super_admin, role)
--     VALUES (<any_auth_user_id>, <tenant_they_admin>, true, 'super_admin');
--   The new row passes USING (tenant_id is in the actor's array), so the
--   inserted user becomes a platform-wide super admin.
--
-- After this migration:
--   The RESTRICTIVE policy added here intersects with the PERMISSIVE policy,
--   so both must pass. Its predicate allows a row through only when either:
--     - the row's is_super_admin is false AND role is not 'super_admin', OR
--     - the authenticated user is already a super admin.
--   Non-super-admins can still manage regular admin_users rows in their
--   tenants, but they cannot elevate anyone (including themselves) to
--   super_admin. Existing super_admins keep full access.
--
-- The predicate is applied to both USING (prevents updating or deleting an
-- existing super_admin row unless you are one) and WITH CHECK (prevents
-- inserting or setting a row to a super_admin state unless you are one).
--
-- The is_super_admin() helper is SECURITY DEFINER with a locked-down
-- search_path so it safely bypasses RLS when checking the caller's own
-- admin_users rows; without SECURITY DEFINER the predicate would recurse
-- through the policy it defines.

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users
    WHERE user_id = auth.uid()
      AND (is_super_admin = true OR role = 'super_admin')
  );
$$;

CREATE POLICY "Block super_admin escalation by non-super-admins"
ON public.admin_users
AS RESTRICTIVE
FOR ALL
TO public
USING (
  (COALESCE(is_super_admin, false) = false AND role IS DISTINCT FROM 'super_admin')
  OR public.is_super_admin()
)
WITH CHECK (
  (COALESCE(is_super_admin, false) = false AND role IS DISTINCT FROM 'super_admin')
  OR public.is_super_admin()
);
