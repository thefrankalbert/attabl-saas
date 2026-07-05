import { headers } from 'next/headers';
import { getTenant } from '@/lib/cache';
import { createClient } from '@/lib/supabase/server';
import { createInventoryService } from '@/services/inventory.service';
import { canAccessFeature } from '@/lib/plans/features';
import { requireAdminPermission } from '@/lib/auth/require-admin-permission';
import TenantNotFound from '@/components/admin/TenantNotFound';
import { FeatureUpgradeWall } from '@/components/admin/FeatureUpgradeWall';
import { StockReportClient } from '@/components/admin/reports/inventory/StockReportClient';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';
import type { CurrencyCode } from '@/types/admin.types';

export const dynamic = 'force-dynamic';

export default async function InventoryReportsPage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
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

  const supabase = await createClient();
  const stock = await createInventoryService(supabase).getStockStatus(tenant.id);

  // Format the date server-side to avoid a hydration mismatch.
  const generatedAt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date());

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <StockReportClient
        tenant={{
          name: tenant.name,
          logoUrl: tenant.logo_url,
          address: tenant.address,
          city: tenant.city,
          country: tenant.country,
          phone: tenant.phone,
        }}
        stock={stock}
        currency={(tenant.currency || 'XAF') as CurrencyCode}
        generatedAt={generatedAt}
      />
    </div>
  );
}
