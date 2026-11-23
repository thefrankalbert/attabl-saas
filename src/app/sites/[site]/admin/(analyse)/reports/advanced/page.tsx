import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import TenantNotFound from '@/components/admin/TenantNotFound';
import AdvancedReportsClient from '@/components/admin/reports/advanced/AdvancedReportsClient';
import { requireAdminPermission } from '@/lib/auth/require-admin-permission';
import { FeatureUpgradeWall } from '@/components/admin/FeatureUpgradeWall';
import { canAccessFeature } from '@/lib/plans/features';
import { resolveTenantTimezone } from '@/lib/timezones';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';

export const dynamic = 'force-dynamic';

export default async function AdvancedReportsPage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site } = await params;
  await requireAdminPermission(site, 'reports.view');
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);
  if (!tenant) {
    return <TenantNotFound />;
  }

  // Rapports avances: Business et plus (l'essai actif compte comme Business).
  // Les fonctions SQL appelees par la page refont le meme controle en base.
  const hasAdvancedReports = canAccessFeature(
    'canAccessAdvancedReports',
    tenant.subscription_plan as SubscriptionPlan | null,
    tenant.subscription_status as SubscriptionStatus | null,
    tenant.trial_ends_at,
  );

  if (!hasAdvancedReports) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <FeatureUpgradeWall
          feature="advancedReports"
          checkoutUrl={`/sites/${tenantSlug}/admin/subscription`}
          tenantId={tenant.id}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <AdvancedReportsClient
        tenantId={tenant.id}
        currency={tenant.currency || 'XAF'}
        timezone={resolveTenantTimezone(tenant)}
      />
    </div>
  );
}
