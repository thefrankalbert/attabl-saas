import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type SessionAdminUser = {
  tenant_id: string;
  role: string;
};

export type ResolveSessionAdminUserResult =
  | { ok: true; userId: string; adminUser: SessionAdminUser }
  | { ok: false; status: 401 | 404; error: string };

/**
 * Resolves the authenticated user's admin_users row via service role.
 * Scoped to auth.uid() from the session - bypasses RLS on lookup only.
 */
export async function resolveSessionAdminUser(options?: {
  requireActive?: boolean;
}): Promise<ResolveSessionAdminUserResult> {
  const requireActive = options?.requireActive ?? true;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, error: 'Non authentifie' };
  }

  const adminSupabase = createAdminClient();
  let query = adminSupabase.from('admin_users').select('tenant_id, role').eq('user_id', user.id);

  if (requireActive) {
    query = query.eq('is_active', true);
  }

  const { data: adminUser, error } = await query.maybeSingle();

  if (error || !adminUser) {
    return { ok: false, status: 404, error: 'Tenant non trouve' };
  }

  return { ok: true, userId: user.id, adminUser };
}
