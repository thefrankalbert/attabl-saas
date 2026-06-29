-- Detach the platform super-admin from any real customer tenant.
--
-- Problem: the platform super-admin (is_super_admin = true) was attached as an
-- admin_users row on a real customer tenant ("Gianni food"). Because the admin
-- shell resolves a user's "home" tenant from admin_users, the super-admin saw
-- the customer's restaurant name as if it were their own.
--
-- Fix (option ii, no schema change - admin_users.tenant_id is NOT NULL): create
-- a dedicated, private platform tenant and repoint the super-admin row at it.
-- Super-admin powers come from the is_super_admin flag (tenant-agnostic), so the
-- god-mode console (/admin/platform) and cross-tenant access keep working; the
-- customer tenant simply drops out of the super-admin's tenant switcher.
--
-- Idempotent and safe on every environment:
--   - ON CONFLICT (slug) DO NOTHING so re-runs are no-ops.
--   - The repoint UPDATE matches 0 rows on DBs without a super-admin (staging).
--
-- Rollback (prod): the prod super-admin (hellofrankalbert@gmail.com) was on
-- tenant 6abc2cf6-bd62-4c80-8e63-3c8608821251 ("Gianni food") before this ran.
-- To revert: UPDATE admin_users SET tenant_id = '6abc2cf6-bd62-4c80-8e63-3c8608821251'
-- WHERE is_super_admin = true AND email = 'hellofrankalbert@gmail.com';

-- 1. Private platform tenant.
--    is_active = false + subscription_status = 'frozen' -> blocked from the
--    storefront and admin pages by the middleware (proxy.ts B2).
--    onboarding_completed = false -> excluded from the public sitemap.
--    group_id = NULL -> never visible to any owner group.
INSERT INTO tenants (slug, name, subscription_plan, subscription_status, is_active, onboarding_completed, group_id)
VALUES ('__platform', 'Platform', 'enterprise', 'frozen', false, false, NULL)
ON CONFLICT (slug) DO NOTHING;

-- 2. Repoint every live super-admin membership onto the platform tenant.
--    Moving tenant_id only is allowed: the prevent_super_admin_elevation trigger
--    exempts service_role and only fires when role / is_super_admin change.
UPDATE admin_users au
SET tenant_id = (SELECT id FROM tenants WHERE slug = '__platform')
WHERE au.is_super_admin = true
  AND au.is_active = true
  AND au.deleted_at IS NULL
  AND au.tenant_id <> (SELECT id FROM tenants WHERE slug = '__platform');
