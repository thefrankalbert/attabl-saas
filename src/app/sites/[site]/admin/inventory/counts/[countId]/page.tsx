import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import TenantNotFound from '@/components/admin/TenantNotFound';
import StockCountSheetClient from '@/components/admin/StockCountSheetClient';
import { FeatureUpgradeWall } from '@/components/admin/FeatureUpgradeWall';
import { canAccessFeature } from '@/lib/plans/features';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';
import { requireAdminPermission } from '@/lib/auth/require-admin-permission';

export const dynamic = 'force-dynamic';

export default async function StockCountSheetPage({
  params,
}: {
  params: Promise<{ site: string; countId: string }>;
}) {
  const { site, countId } = await params;
  await requireAdminPermission(site, 'inventory.view');
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  const hasInventory = canAccessFeature(
    'canAccessInventory',
    tenant.subscription_plan as SubscriptionPlan | null,
    tenant.subscription_status as SubscriptionStatus | null,
    tenant.trial_ends_at,
  );

  if (!hasInventory) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <FeatureUpgradeWall
          feature="inventory"
          checkoutUrl={`/sites/${tenantSlug}/admin/subscription`}
          tenantId={tenant.id}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <StockCountSheetClient tenantId={tenant.id} countId={countId} />
    </div>
  );
}
