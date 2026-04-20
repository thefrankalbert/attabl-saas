-- SECURITY HARDENING: Prevent within-tenant privilege escalation via
-- admin_users UPDATE, by locking the privilege columns to service_role.
--
-- Before this migration (even after 20260420000001 closed the cross-tenant
-- super_admin vector):
--   A tenant admin could still UPDATE their own admin_users row to
--     - role = 'owner' (escalate admin -> owner inside their tenant)
--     - custom_permissions = { '*': true } (self-grant arbitrary permissions)
--     - email / tenant_id / user_id (rewrite identity)
--   The PERMISSIVE policy "Admins can manage own tenant admins" only filtered
--   by tenant_id, and Supabase's default table-level UPDATE grant exposed
--   every column to the authenticated role.
--
-- After this migration:
--   Table-level UPDATE is revoked from anon and authenticated. We re-grant
--   UPDATE only on the profile/bookkeeping columns that are legitimately
--   managed from an authenticated context:
--     full_name, phone, last_login, last_login_at, login_count, is_active
--
--   All privilege-bearing and identity columns can now only be written via
--   service_role. The legitimate paths for role / custom_permissions
--   management already go through server actions using the admin client:
--     - signup.service.ts (creates admin rows during signup)
--     - invitation.service.ts / invitations/accept (accepts invites)
--     - restaurant-group.service.ts (group ownership)
--     - actions/admin.ts (role changes from dashboard)
--   None of these are affected because service_role bypasses column grants.

REVOKE UPDATE ON public.admin_users FROM authenticated;
REVOKE UPDATE ON public.admin_users FROM anon;

GRANT UPDATE (full_name, phone, last_login, last_login_at, login_count, is_active)
  ON public.admin_users TO authenticated;
