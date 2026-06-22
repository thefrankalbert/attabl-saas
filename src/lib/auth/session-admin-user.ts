import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSignupService } from '@/services/signup.service';
import { logger } from '@/lib/logger';
import { pickOnboardingTenantIndex } from '@/lib/onboarding/select-onboarding-tenant';

type SessionAdminUser = {
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

  // Pick the working tenant deterministically: the most recently created tenant whose
  // onboarding is unfinished (else the most recent overall). NEVER order by the uuid
  // primary key - that is non-deterministic and gave multi-tenant owners a random tenant.
  async function loadChosenAdminUser(): Promise<{ data: SessionAdminUser | null; error: unknown }> {
    let q = adminSupabase
      .from('admin_users')
      .select('tenant_id, role, tenants ( onboarding_completed, created_at )')
      .eq('user_id', user!.id);
    if (requireActive) {
      q = q.eq('is_active', true);
    }
    const { data, error: qErr } = await q;
    if (qErr || !data || data.length === 0) {
      return { data: null, error: qErr };
    }
    const index = pickOnboardingTenantIndex(
      data.map((row) => {
        const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
        return {
          onboardingCompleted: !!tenant?.onboarding_completed,
          createdAt: tenant?.created_at ?? null,
        };
      }),
    );
    const chosen = data[index];
    return { data: { tenant_id: chosen.tenant_id, role: chosen.role }, error: null };
  }

  let { data: adminUser, error } = await loadChosenAdminUser();

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

    const retry = await loadChosenAdminUser();
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
