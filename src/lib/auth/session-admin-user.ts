import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSignupService } from '@/services/signup.service';
import { logger } from '@/lib/logger';
import { pickOnboardingTenantIndex } from '@/lib/onboarding/select-onboarding-tenant';

type SessionAdminUser = {
  tenant_id: string;
  role: string;
  /** Slug of the chosen tenant (null only if the join came back empty). */
  tenant_slug: string | null;
  onboarding_completed: boolean;
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
  /**
   * Slug of the establishment the user explicitly asked for (e.g. the
   * "reprendre l'installation" dialog of restaurant B). It only SELECTS among
   * the user's own memberships: a slug the user is not a member of is refused,
   * never silently replaced by another tenant (that would write B's answers
   * into C). It grants nothing - the membership lookup stays scoped to
   * auth.uid().
   */
  siteSlug?: string | null;
  /**
   * Only consider memberships where the user is OWNER (the onboarding routes).
   * Otherwise an owner of an unfinished restaurant who is also a waiter in a
   * more recent one was resolved to the waiter membership, and refused.
   */
  ownerOnly?: boolean;
}): Promise<ResolveSessionAdminUserResult> {
  const requireActive = options?.requireActive ?? true;
  const provisionIfMissing = options?.provisionIfMissing ?? false;
  const siteSlug = options?.siteSlug?.trim() || null;
  const ownerOnly = options?.ownerOnly ?? false;

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
  /**
   * `hasAnyMembership` distinguishes "this account has no establishment at all"
   * (a signup that stopped halfway: provisioning may rescue it) from "it has
   * some, but none matches" (wrong link, or not an owner): provisioning there
   * would create a restaurant as a side effect.
   */
  async function loadChosenAdminUser(): Promise<{
    data: SessionAdminUser | null;
    error: unknown;
    hasAnyMembership: boolean;
  }> {
    let q = adminSupabase
      .from('admin_users')
      .select('tenant_id, role, tenants ( slug, onboarding_completed, created_at )')
      .eq('user_id', user!.id);
    if (requireActive) {
      q = q.eq('is_active', true);
    }
    const { data, error: qErr } = await q;
    if (qErr) {
      return { data: null, error: qErr, hasAnyMembership: false };
    }
    if (!data || data.length === 0) {
      return { data: null, error: null, hasAnyMembership: false };
    }
    const allRows = data.map((row) => {
      const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
      return {
        tenant_id: row.tenant_id,
        role: row.role,
        tenant_slug: tenant?.slug ?? null,
        onboarding_completed: !!tenant?.onboarding_completed,
        createdAt: tenant?.created_at ?? null,
      };
    });
    const rows = ownerOnly ? allRows.filter((row) => row.role === 'owner') : allRows;

    let chosen: (typeof rows)[number] | undefined;
    if (siteSlug) {
      chosen = rows.find((row) => row.tenant_slug === siteSlug);
    } else {
      const index = pickOnboardingTenantIndex(
        rows.map((row) => ({
          onboardingCompleted: row.onboarding_completed,
          createdAt: row.createdAt,
        })),
      );
      chosen = rows[index];
    }
    if (!chosen) {
      return { data: null, error: null, hasAnyMembership: true };
    }
    return {
      data: {
        tenant_id: chosen.tenant_id,
        role: chosen.role,
        tenant_slug: chosen.tenant_slug,
        onboarding_completed: chosen.onboarding_completed,
      },
      error: null,
      hasAnyMembership: true,
    };
  }

  const first = await loadChosenAdminUser();
  let adminUser = first.data;
  let error = first.error;

  // Provisioning only rescues an account with NO establishment at all, read
  // successfully. Not on a lookup error (a transient failure is not "no
  // restaurant"), not when memberships exist but none matched (an explicit
  // slug that is not the user's, or a non-owner on the onboarding).
  if (!error && !adminUser && !first.hasAnyMembership && provisionIfMissing && !siteSlug) {
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
