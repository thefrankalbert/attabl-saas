import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import TenantNotFound from '@/components/admin/TenantNotFound';
import ServiceManager from '@/components/admin/ServiceManager';
import { FeatureUpgradeWall } from '@/components/admin/FeatureUpgradeWall';
import { canAccessFeature } from '@/lib/plans/features';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';
import { getTranslations } from 'next-intl/server';
import AdminSrTitle from '@/components/admin/AdminSrTitle';

export const dynamic = 'force-dynamic';

export default async function ServicePage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const tTitle = await getTranslations('sidebar');
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  // Plan gate: floor plan + server assignments are Pro+ (see pricing-data.ts).
  const hasService = canAccessFeature(
    'canAccessService',
    tenant.subscription_plan as SubscriptionPlan | null,
    tenant.subscription_status as SubscriptionStatus | null,
    tenant.trial_ends_at,
  );

  if (!hasService) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <FeatureUpgradeWall
          feature="service"
          checkoutUrl={`/sites/${tenantSlug}/admin/subscription`}
          tenantId={tenant.id}
        />
      </div>
    );
  }

  // Devise de comptabilisation du tenant. Repli sur XAF, la devise par defaut du
  // produit, quand la colonne est vide - jamais une valeur en dur cote composant.
  return (
    <>
      <AdminSrTitle label={tTitle('navService')} />
      <ServiceManager tenantId={tenant.id} currency={tenant.currency ?? 'XAF'} />
    </>
  );
}
