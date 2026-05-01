import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import KitchenClient from '@/components/admin/KitchenClient';
import TenantNotFound from '@/components/admin/TenantNotFound';
import { FeatureUpgradeWall } from '@/components/admin/FeatureUpgradeWall';
import { canAccessFeature } from '@/lib/plans/features';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';

export const dynamic = 'force-dynamic';

export default async function KitchenPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  const hasKDS = canAccessFeature(
    'canAccessKDS',
    tenant.subscription_plan as SubscriptionPlan | null,
    tenant.subscription_status as SubscriptionStatus | null,
    tenant.trial_ends_at,
  );

  if (!hasKDS) {
    return (
      <FeatureUpgradeWall
        feature="kds"
        checkoutUrl={`/sites/${tenantSlug}/admin/subscription`}
        tenantId={tenant.id}
      />
    );
  }

  return (
    <KitchenClient
      tenantId={tenant.id}
      tenantName={tenant.name}
      notificationSoundId={tenant.notification_sound_id ?? undefined}
      barDisplayEnabled={tenant.bar_display_enabled ?? false}
    />
  );
}
