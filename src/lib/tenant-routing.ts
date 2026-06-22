import 'server-only';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isReservedSiteSlug } from '@/lib/tenant-slugs';
import { pickOnboardingTenantIndex } from '@/lib/onboarding/select-onboarding-tenant';

/**
 * Sends the user to their real tenant admin (or onboarding / login).
 */
export async function redirectFromReservedSiteSlug(): Promise<never> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=/admin/tenants');
  }

  // Fetch ALL active links and pick the working tenant deterministically (most recent
  // unfinished, else most recent). Ordering by the uuid primary key is non-deterministic
  // and sent multi-tenant owners to an arbitrary establishment.
  const { data: links } = await supabase
    .from('admin_users')
    .select('tenants(slug, onboarding_completed, created_at)')
    .eq('user_id', user.id)
    .eq('is_active', true);

  type TenantRow = { slug: string; onboarding_completed: boolean; created_at: string | null };
  const tenants: TenantRow[] = (links ?? [])
    .map((link) => (Array.isArray(link.tenants) ? link.tenants[0] : link.tenants))
    .filter((candidate): candidate is TenantRow => !!candidate);

  if (tenants.length > 0) {
    const pickIndex = pickOnboardingTenantIndex(
      tenants.map((candidate) => ({
        onboardingCompleted: !!candidate.onboarding_completed,
        createdAt: candidate.created_at,
      })),
    );
    const row = tenants[pickIndex];

    if (row?.slug && !isReservedSiteSlug(row.slug)) {
      if (row.onboarding_completed === false) {
        redirect('/onboarding');
      }
      redirect(`/sites/${row.slug}/admin`);
    }
  }

  redirect('/onboarding');
}
