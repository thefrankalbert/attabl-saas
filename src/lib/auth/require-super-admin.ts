import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { AuthError } from '@/lib/auth/get-session';

export interface SuperAdminContext {
  user: { id: string; email: string };
  supabase: Awaited<ReturnType<typeof createClient>>;
}

/**
 * Returns true if the authenticated user holds platform super-admin rights.
 *
 * A user is super-admin if ANY of their admin_users rows carries the
 * is_super_admin flag (or the legacy role === 'super_admin'). The flag is
 * verified server-side against the DB - never trusted from the client or from
 * user_metadata (which the user can edit).
 */
export async function isSuperAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('admin_users')
    .select('is_super_admin, role')
    .eq('user_id', userId)
    // A revoked operator (banned or soft-deleted) must lose god mode, not keep
    // it: only LIVE memberships can confer super-admin.
    .eq('is_active', true)
    .is('deleted_at', null);

  if (error) {
    logger.error('isSuperAdmin: lookup failed', error, { userId });
    return false;
  }

  return (data ?? []).some((row) => row.is_super_admin === true || row.role === 'super_admin');
}

/**
 * Gate a server action / API route behind platform super-admin rights.
 *
 * Use this for god-mode operations (suspend/delete tenant, ban user, ...).
 * Owners and tenant admins are NOT super-admins: this is strictly the platform
 * operator. Always verifies against auth.getUser() (server-validated token).
 *
 * @throws {AuthError} 401 if not authenticated, 403 if not super-admin.
 */
export async function requireSuperAdmin(): Promise<SuperAdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthError('Non authentifie', 401);
  }

  if (!(await isSuperAdmin(supabase, user.id))) {
    logger.warn('Non-super-admin attempted a platform action', { userId: user.id });
    throw new AuthError('Acces reserve au super administrateur', 403);
  }

  return { user: { id: user.id, email: user.email ?? '' }, supabase };
}
