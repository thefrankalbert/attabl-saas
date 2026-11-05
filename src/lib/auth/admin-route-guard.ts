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
