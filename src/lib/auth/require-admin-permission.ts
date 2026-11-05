import 'server-only';
import { readTenantSlug } from '@/lib/auth/tenant-header';

import { headers } from 'next/headers';

import { getTenant } from '@/lib/cache';
import { createClient } from '@/lib/supabase/server';
import type { AdminRole } from '@/types/admin.types';
import type { PermissionCode } from '@/types/permission.types';

import { redirectToLogin, redirectToUnauthorized } from './redirect-to-main';
import { resolveAdminPermission } from './resolve-admin-permission';

export interface AdminPermissionContext {
  tenantId: string;
  role: AdminRole;
}

/**
 * Server-side route guard for admin pages.
 *
 * Enforces a single permission code for the authenticated user on the resolved
 * tenant; redirects to /unauthorized when it is missing, /login when there is
 * no session.
 *
 * This closes the gap where admin page ROUTES rendered for any authenticated
 * staff member regardless of role - sensitive write endpoints were already
 * permission-gated, but page shells (and their server-loaded data) were not.
 *
 * The resolution lives in `resolve-admin-permission`, shared with the
 * middleware gate: live membership (is_active, no deleted_at) OR live platform
 * super_admin, then the 3-level `hasPermission` model.
 */
export async function requireAdminPermission(
  site: string,
  permission: PermissionCode,
): Promise<AdminPermissionContext> {
  const headersList = await headers();
  const tenantSlug = readTenantSlug(headersList).slug || site;

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

  const { allowed, role } = await resolveAdminPermission(supabase, user.id, tenant.id, permission);

  if (!allowed || !role) {
    redirectToUnauthorized();
  }

  return { tenantId: tenant.id, role };
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
  const tenantSlug = readTenantSlug(headersList).slug || site;

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

  const { allowed } = await resolveAdminPermission(supabase, user.id, tenant.id, permission);
  return allowed;
}
