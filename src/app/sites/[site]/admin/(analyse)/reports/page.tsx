import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import TenantNotFound from '@/components/admin/TenantNotFound';
import ReportsClient from '@/components/admin/ReportsClient';
import { requireAdminPermission } from '@/lib/auth/require-admin-permission';
import { FeatureUpgradeWall } from '@/components/admin/FeatureUpgradeWall';
import { canAccessFeature } from '@/lib/plans/features';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';

export const dynamic = 'force-dynamic';

export default async function ReportsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  await requireAdminPermission(site, 'reports.view');
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  // L'acces est decide UNE fois, par requireAdminPermission ci-dessus: session,
  // appartenance active, puis droit `reports.view` avec les surcharges du
  // proprietaire. Une seconde liste de roles ecrite en dur refusait ici le
  // caissier a qui le proprietaire avait donne ce droit: le lien Rapports
  // apparaissait dans son menu et menait a un refus (audit 2026-11-10, C-071).

  // Plan gate: sales reports + best sellers are Pro+ (see pricing-data.ts).
  const hasReports = canAccessFeature(
    'canAccessReports',
    tenant.subscription_plan as SubscriptionPlan | null,
    tenant.subscription_status as SubscriptionStatus | null,
    tenant.trial_ends_at,
  );

  if (!hasReports) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <FeatureUpgradeWall
          feature="reports"
          checkoutUrl={`/sites/${tenantSlug}/admin/subscription`}
          tenantId={tenant.id}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <ReportsClient tenantId={tenant.id} currency={tenant.currency || 'XAF'} />
    </div>
  );
}
