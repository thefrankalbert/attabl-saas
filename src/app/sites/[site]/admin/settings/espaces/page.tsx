import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { redirectToLogin } from '@/lib/auth/redirect-to-main';
import { requireAdminPermission } from '@/lib/auth/require-admin-permission';
import { getPlanLimits } from '@/lib/plans/features';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';
import { EspacesManager, type EspaceRow } from '@/components/admin/settings/EspacesManager';

export const dynamic = 'force-dynamic';

export default async function EspacesPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  await requireAdminPermission(site, 'settings.view');
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirectToLogin();

  const tenant = await getTenant(site);
  if (!tenant) redirectToLogin();

  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('tenant_id', tenant.id)
    .single();
  if (!adminUser) redirectToLogin();

  const tenantId = tenant.id;

  // Espaces (venues) du tenant + nb de tables par espace.
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, is_active, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  const venueIds = (venues ?? []).map((v) => v.id);

  // Compte des tables par venue via zones -> tables (une requete groupee simple).
  const tableCounts = new Map<string, number>();
  if (venueIds.length > 0) {
    const { data: zones } = await supabase
      .from('zones')
      .select('id, venue_id')
      .in('venue_id', venueIds);
    const zoneToVenue = new Map((zones ?? []).map((z) => [z.id as string, z.venue_id as string]));
    const zoneIds = [...zoneToVenue.keys()];
    if (zoneIds.length > 0) {
      const { data: tables } = await supabase
        .from('tables')
        .select('zone_id')
        .in('zone_id', zoneIds);
      for (const tbl of tables ?? []) {
        const vId = zoneToVenue.get(tbl.zone_id as string);
        if (vId) tableCounts.set(vId, (tableCounts.get(vId) ?? 0) + 1);
      }
    }
  }

  const espaces: EspaceRow[] = (venues ?? []).map((v) => ({
    id: v.id as string,
    name: v.name as string,
    is_active: v.is_active as boolean,
    created_at: v.created_at as string,
    tableCount: tableCounts.get(v.id as string) ?? 0,
  }));

  const limits = getPlanLimits(
    tenant.subscription_plan as SubscriptionPlan | null,
    tenant.subscription_status as SubscriptionStatus | null,
    tenant.trial_ends_at,
  );
  const activeCount = espaces.filter((e) => e.is_active).length;

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full">
      <EspacesManager
        espaces={espaces}
        maxEspaces={limits.maxVenues}
        activeCount={activeCount}
        subscriptionUrl={`/sites/${site}/admin/subscription`}
        backUrl={`/sites/${site}/admin/settings`}
      />
    </div>
  );
}
