import 'server-only';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isReservedSiteSlug } from '@/lib/tenant-slugs';

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

  const { data: link } = await supabase
    .from('admin_users')
    .select('tenants(slug, onboarding_completed)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  const tenant = link?.tenants as
    | { slug: string; onboarding_completed: boolean }
    | { slug: string; onboarding_completed: boolean }[]
    | null;

  const row = Array.isArray(tenant) ? tenant[0] : tenant;

  if (row?.slug && !isReservedSiteSlug(row.slug)) {
    if (row.onboarding_completed === false) {
      redirect('/onboarding');
    }
    redirect(`/sites/${row.slug}/admin`);
  }

  redirect('/onboarding');
}
