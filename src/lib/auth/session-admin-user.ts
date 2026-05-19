import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSignupService } from '@/services/signup.service';
import { logger } from '@/lib/logger';

export type SessionAdminUser = {
  tenant_id: string;
  role: string;
};

export type ResolveSessionAdminUserResult =
  | { ok: true; userId: string; adminUser: SessionAdminUser }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Resolves the authenticated user's admin_users row via service role.
 * Scoped to auth.uid() from the session - bypasses RLS on lookup only.
 */
export async function resolveSessionAdminUser(options?: {
  requireActive?: boolean;
  /** Create tenant + admin_users when missing (onboarding recovery after partial signup) */
  provisionIfMissing?: boolean;
}): Promise<ResolveSessionAdminUserResult> {
  const requireActive = options?.requireActive ?? true;
  const provisionIfMissing = options?.provisionIfMissing ?? false;

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

  let { data: adminUser, error } = await query
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if ((error || !adminUser) && provisionIfMissing) {
    const email = user.email;
    if (!email) {
      return { ok: false, status: 403, error: 'Email requis pour creer votre etablissement' };
    }

    const restaurantName =
      typeof user.user_metadata?.restaurant_name === 'string'
        ? user.user_metadata.restaurant_name
        : undefined;

    try {
      const signupService = createSignupService(adminSupabase);
      await signupService.ensureTenantForOnboarding({
        userId: user.id,
        email,
        restaurantName,
        plan: 'starter',
      });
    } catch (provisionError) {
      logger.error('Onboarding tenant provisioning failed', provisionError, { userId: user.id });
      return { ok: false, status: 403, error: 'Impossible de creer votre etablissement' };
    }

    const retry = await query.order('id', { ascending: false }).limit(1).maybeSingle();
    adminUser = retry.data;
    error = retry.error;
  }

  if (error) {
    logger.error('admin_users lookup failed', error, { userId: user.id });
  }

  if (error || !adminUser) {
    return { ok: false, status: 403, error: 'Compte etablissement introuvable' };
  }

  return { ok: true, userId: user.id, adminUser };
}
