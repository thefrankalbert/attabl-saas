import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import TenantNotFound from '@/components/admin/TenantNotFound';
import VenueReportsClient from '@/components/admin/reports/VenueReportsClient';
import { requireAdminPermission } from '@/lib/auth/require-admin-permission';
import { FeatureUpgradeWall } from '@/components/admin/FeatureUpgradeWall';
import { canAccessFeature } from '@/lib/plans/features';
import { resolveTenantTimezone } from '@/lib/timezones';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';
import { adminPageMetadata } from '@/lib/admin-page-metadata';

export async function generateMetadata() {
  return adminPageMetadata('sidebar', 'navVenueReports');
}

export const dynamic = 'force-dynamic';

export default async function VenueReportsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  await requireAdminPermission(site, 'reports.view');
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);
  if (!tenant) {
    return <TenantNotFound />;
  }

  // Rapports par espace: Business et plus (l'essai actif compte comme Business).
  // Les fonctions SQL appelees par la page refont le meme controle en base.
  const hasVenueReports = canAccessFeature(
    'canAccessVenueReports',
    tenant.subscription_plan as SubscriptionPlan | null,
    tenant.subscription_status as SubscriptionStatus | null,
    tenant.trial_ends_at,
  );

  if (!hasVenueReports) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <FeatureUpgradeWall
          feature="venueReports"
          checkoutUrl={`/sites/${tenantSlug}/admin/subscription`}
          tenantId={tenant.id}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <VenueReportsClient
        tenantId={tenant.id}
        currency={tenant.currency || 'XAF'}
        timezone={resolveTenantTimezone(tenant)}
        spacesHref={`/sites/${tenantSlug}/admin/settings/espaces`}
      />
    </div>
  );
}
