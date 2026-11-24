import type { SupabaseClient } from '@supabase/supabase-js';

import type { PermissionCode } from '@/types/permission.types';

import { resolveAdminPermission } from './resolve-admin-permission';

/**
 * Returns true if the authenticated user is DENIED access to an admin route
 * that requires `permission`, for the given tenant.
 *
 * Used by the middleware (proxy.ts) to enforce per-route role permissions with a
 * clean server-side redirect. The resolution itself lives in
 * `resolve-admin-permission` and is shared with the per-page guards, so the
 * three gates cannot drift apart again - read that file for why that matters.
 *
 * Fails CLOSED: any resolution error denies access.
 */
export async function isAdminRouteDenied(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  permission: PermissionCode,
): Promise<boolean> {
  const { allowed } = await resolveAdminPermission(supabase, userId, tenantId, permission);
  return !allowed;
}

/**
 * Returns true if the authenticated user is NOT a living member of the tenant
 * (nor a platform super-admin). Used by the middleware for the admin routes
 * that need no specific permission: they are open to every member, but to
 * members only. Same resolution as `requireAdminMember` (page guard).
 *
 * Fails CLOSED: any resolution error denies access.
 */
export async function isAdminMemberDenied(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const { role } = await resolveAdminPermission(supabase, userId, tenantId, 'menu.view');
  return !role;
}
