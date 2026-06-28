import type { SupabaseClient } from '@supabase/supabase-js';

import { hasPermission } from '@/lib/permissions';
import type { AdminRole, AdminUser } from '@/types/admin.types';
import type { PermissionCode, RolePermissions } from '@/types/permission.types';

/**
 * Returns true if the authenticated user is DENIED access to an admin route
 * that requires `permission`, for the given tenant.
 *
 * Used by the middleware (proxy.ts) to enforce per-route role permissions with a
 * clean server-side redirect. Resolution mirrors the admin layout and the
 * 3-level `hasPermission` model:
 *   1. direct tenant member -> their role + custom_permissions
 *   2. otherwise super_admin (owner-level access anywhere) -> allowed
 *   3. neither -> denied
 *
 * Fails CLOSED: any resolution error denies access.
 */
export async function isAdminRouteDenied(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  permission: PermissionCode,
): Promise<boolean> {
  // Only LIVE memberships count: a banned (is_active=false) or soft-deleted
  // member/operator must be denied, consistent with the admin layout gate.
  const { data: adminData } = await supabase
    .from('admin_users')
    .select('role, custom_permissions, is_super_admin')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (!adminData) {
    // Not a direct member - allow only LIVE platform super_admins.
    const { data: superAdmin } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', userId)
      .eq('is_super_admin', true)
      .eq('is_active', true)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    return !superAdmin; // denied unless super admin
  }

  if (adminData.is_super_admin) {
    return false; // super admin - allowed
  }

  const { data: roleOverride } = await supabase
    .from('role_permissions')
    .select('permissions')
    .eq('tenant_id', tenantId)
    .eq('role', adminData.role)
    .maybeSingle();

  const override = roleOverride
    ? ({ permissions: roleOverride.permissions } as unknown as RolePermissions)
    : null;

  // hasPermission only reads role + custom_permissions.
  const principal = {
    role: adminData.role as AdminRole,
    custom_permissions: adminData.custom_permissions,
  } as unknown as AdminUser;

  return !hasPermission(principal, permission, override);
}
