import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import KitchenClient from '@/components/admin/KitchenClient';
import TenantNotFound from '@/components/admin/TenantNotFound';
import { FeatureUpgradeWall } from '@/components/admin/FeatureUpgradeWall';
import { canAccessFeature } from '@/lib/plans/features';
import { kitchenMayFinishForTenant } from '@/lib/billing/lapsed-trial';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';
import { getTranslations } from 'next-intl/server';
import AdminSrTitle from '@/components/admin/AdminSrTitle';

export const dynamic = 'force-dynamic';

export default async function KitchenPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const tTitle = await getTranslations('sidebar');
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  // Fin d'essai: le plan effectif retombe sur le plan stocke (souvent
  // `starter`, sans cuisine). La cuisine reste pourtant ouverte pour finir les
  // commandes d'avant la fin d'essai (decision produit du 2026-11-09). Le
  // service_role n'est lu que si l'ecran de cuisine serait refuse.
  const hasKDS =
    canAccessFeature(
      'canAccessKDS',
      tenant.subscription_plan as SubscriptionPlan | null,
      tenant.subscription_status as SubscriptionStatus | null,
      tenant.trial_ends_at,
    ) || (await kitchenMayFinishForTenant(tenant.id, tenant));

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
    <>
      <AdminSrTitle label={tTitle('navKitchen')} />
      <KitchenClient
        tenantId={tenant.id}
        tenantName={tenant.name}
        barDisplayEnabled={tenant.bar_display_enabled ?? false}
      />
    </>
  );
}
