import 'server-only';

import { headers } from 'next/headers';

import { getTenant } from '@/lib/cache';
import { hasPermission } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import type { AdminRole, AdminUser } from '@/types/admin.types';
import type { PermissionCode, RolePermissions } from '@/types/permission.types';

import { redirectToLogin, redirectToUnauthorized } from './redirect-to-main';

export interface AdminPermissionContext {
  tenantId: string;
  role: AdminRole;
}

/**
 * Server-side route guard for admin pages.
 *
 * Mirrors the user-resolution in the admin layout (direct tenant member OR
 * super_admin virtual-owner) and then enforces a single permission code. If the
 * authenticated user lacks the permission, redirects to /unauthorized.
 *
 * This closes the gap where admin page ROUTES rendered for any authenticated
 * staff member regardless of role - sensitive write endpoints were already
 * permission-gated, but page shells (and their server-loaded data) were not.
 *
 * Resolution uses the same 3-level model as `hasPermission`:
 * individual override -> tenant role override -> default role matrix.
 */
export async function requireAdminPermission(
  site: string,
  permission: PermissionCode,
): Promise<AdminPermissionContext> {
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const supabase = await createClient();
  const [
    tenant,
    {
      data: { user },
      error: authError,
    },
  ] = await Promise.all([getTenant(tenantSlug), supabase.auth.getUser()]);

  if (!tenant) {
    redirectToUnauthorized();
  }

  if (authError || !user) {
    redirectToLogin();
  }

  // 1. Direct tenant member
  const { data: adminData } = await supabase
    .from('admin_users')
    .select('role, custom_permissions')
    .eq('user_id', user.id)
    .eq('tenant_id', tenant.id)
    .single();

  // hasPermission only reads `role` and `custom_permissions`.
  let principal: Pick<AdminUser, 'role' | 'custom_permissions'>;

  if (adminData) {
    principal = {
      role: adminData.role as AdminRole,
      custom_permissions: adminData.custom_permissions,
    };
  } else {
    // 2. Super admin (can access any tenant with owner-level access)
    const { data: superAdminCheck } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_super_admin', true)
      .limit(1)
      .single();

    if (!superAdminCheck) {
      redirectToUnauthorized();
    }

    principal = { role: 'owner' as AdminRole, custom_permissions: null };
  }

  const adminUser = principal as AdminUser;

  // 3. Per-tenant role override (medium priority in hasPermission resolution)
  const { data: roleOverride } = await supabase
    .from('role_permissions')
    .select('role, permissions')
    .eq('tenant_id', tenant.id)
    .eq('role', adminUser.role)
    .maybeSingle();

  // hasPermission only reads `.permissions`; the select omits the other
  // RolePermissions fields, so narrow via cast.
  const override = roleOverride
    ? ({ permissions: roleOverride.permissions } as unknown as RolePermissions)
    : null;

  if (!hasPermission(adminUser, permission, override)) {
    redirectToUnauthorized();
  }

  return { tenantId: tenant.id, role: adminUser.role };
}

/**
 * Non-redirecting permission check for pages that must stay reachable for all
 * roles but conditionally hide sensitive widgets (e.g. the admin dashboard home
 * hides revenue from roles without `reports.view`).
 *
 * Returns `false` on any failure (no session, no tenant, non-member) so the
 * caller defaults to hiding the gated content.
 */
export async function getAdminPermission(
  site: string,
  permission: PermissionCode,
): Promise<boolean> {
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const supabase = await createClient();
  const [
    tenant,
    {
      data: { user },
    },
  ] = await Promise.all([getTenant(tenantSlug), supabase.auth.getUser()]);

  if (!tenant || !user) {
    return false;
  }

  const { data: adminData } = await supabase
    .from('admin_users')
    .select('role, custom_permissions')
    .eq('user_id', user.id)
    .eq('tenant_id', tenant.id)
    .single();

  if (!adminData) {
    // Super admins get owner-level access everywhere.
    const { data: superAdminCheck } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_super_admin', true)
      .limit(1)
      .single();
    return Boolean(superAdminCheck);
  }

  const principal = {
    role: adminData.role as AdminRole,
    custom_permissions: adminData.custom_permissions,
  } as AdminUser;

  const { data: roleOverride } = await supabase
    .from('role_permissions')
    .select('role, permissions')
    .eq('tenant_id', tenant.id)
    .eq('role', principal.role)
    .maybeSingle();

  const override = roleOverride
    ? ({ permissions: roleOverride.permissions } as unknown as RolePermissions)
    : null;

  return hasPermission(principal, permission, override);
}
