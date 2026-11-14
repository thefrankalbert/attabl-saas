import { getCachedTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import ClientOrders from '@/components/tenant/ClientOrders';
import OrdersTabs from '@/components/tenant/OrdersTabs';
import { getTranslations } from 'next-intl/server';

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ site: string }>;
  searchParams: Promise<{ history?: string }>;
}) {
  const { site } = await params;
  const resolvedSearch = await searchParams;
  const showHistory = resolvedSearch.history === 'true';
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  if (!tenantSlug) return notFound();

  // Lecture par le cache service_role: un convive connecte (autre restaurant,
  // compte de test) n'a pas le droit de lire la ligne `tenants` d'un restaurant
  // dont il n'est pas membre (policy resserree, constat T-02).
  const tenant = await getCachedTenant(tenantSlug);

  if (!tenant || !tenant.is_active) return notFound();

  const t = await getTranslations('tenant');

  return (
    <div className="h-full bg-white text-[var(--color-ink)]">
      {/* Sticky header: title + pill tabs */}
      <div className="sticky top-0 z-40 bg-white">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-3">
          <h1 className="text-[19px] font-semibold tracking-[-0.6px] text-[var(--color-ink)]">
            {t('ordersTitle')}
          </h1>
          <div className="mt-3">
            <OrdersTabs
              tenantSlug={tenantSlug}
              showHistory={showHistory}
              activeLabel={t('ordersActive')}
              historyLabel={t('ordersHistory')}
            />
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 pb-28">
        <ClientOrders
          tenantSlug={tenantSlug}
          tenantId={tenant.id}
          currency={tenant.currency || 'XAF'}
          showHistory={showHistory}
        />
      </div>
    </div>
  );
}
