import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { mapMembershipRows, type PostLoginMembership } from '@/lib/auth/post-login-destination';

/**
 * Loads the memberships of an ALREADY authenticated user, with the columns
 * `postLoginDestination` needs. Same select as the password login route and
 * the OAuth callback, so every entry point routes a user the same way.
 *
 * Returns `null` when the lookup fails: callers must then NOT redirect (a
 * transient DB error is not "this user has no restaurant").
 */
export async function loadSessionMemberships(
  supabase: SupabaseClient,
  userId: string,
): Promise<PostLoginMembership[] | null> {
  const { data, error } = await supabase
    .from('admin_users')
    .select(
      'tenant_id, is_super_admin, role, is_active, deleted_at, tenants(slug, onboarding_completed, created_at, deleted_at)',
    )
    .eq('user_id', userId);
  if (error) return null;
  return mapMembershipRows(data);
}
