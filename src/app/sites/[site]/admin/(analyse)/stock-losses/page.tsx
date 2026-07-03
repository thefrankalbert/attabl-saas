import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import TenantNotFound from '@/components/admin/TenantNotFound';
import LossesReportClient from '@/components/admin/LossesReportClient';
import { FeatureUpgradeWall } from '@/components/admin/FeatureUpgradeWall';
import { canAccessFeature } from '@/lib/plans/features';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';
import { requireAdminPermission } from '@/lib/auth/require-admin-permission';
import { createClient } from '@/lib/supabase/server';
import { createInventoryService } from '@/services/inventory.service';
import { logger } from '@/lib/logger';
import type { LossByReason } from '@/types/inventory.types';

export const dynamic = 'force-dynamic';

export default async function StockLossesPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
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

  // Default range = all losses; the client refetches on date filter.
  let initialRows: LossByReason[] = [];
  try {
    const supabase = await createClient();
    const service = createInventoryService(supabase);
    initialRows = await service.getLossesByReason(tenant.id);
  } catch (err) {
    logger.error('Failed to load losses report', { error: err, tenantId: tenant.id });
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <LossesReportClient
        tenantId={tenant.id}
        currency={tenant.currency || 'XAF'}
        initialRows={initialRows}
      />
    </div>
  );
}
