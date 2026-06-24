import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import TenantNotFound from '@/components/admin/TenantNotFound';
import RecipesClient from '@/components/admin/RecipesClient';
import { FeatureUpgradeWall } from '@/components/admin/FeatureUpgradeWall';
import { canAccessFeature } from '@/lib/plans/features';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';
import { requireAdminPermission } from '@/lib/auth/require-admin-permission';

export const dynamic = 'force-dynamic';

export default async function RecipesPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  await requireAdminPermission(site, 'inventory.view');
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  const hasRecipes = canAccessFeature(
    'canAccessRecipes',
    tenant.subscription_plan as SubscriptionPlan | null,
    tenant.subscription_status as SubscriptionStatus | null,
    tenant.trial_ends_at,
  );

  if (!hasRecipes) {
    return (
      <div className="max-w-7xl xl:max-w-[90rem] 2xl:max-w-[100rem] mx-auto">
        <FeatureUpgradeWall
          feature="recipes"
          checkoutUrl={`/sites/${tenantSlug}/admin/subscription`}
          tenantId={tenant.id}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0 max-w-7xl xl:max-w-[90rem] 2xl:max-w-[100rem] mx-auto w-full">
      <RecipesClient tenantId={tenant.id} />
    </div>
  );
}
