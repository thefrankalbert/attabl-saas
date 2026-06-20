import { createClient } from '@/lib/supabase/server';
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

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, currency')
    .eq('slug', tenantSlug)
    .single();

  if (!tenant) return notFound();

  const t = await getTranslations('tenant');

  return (
    <div className="h-full bg-white text-[#1A1A1A]">
      {/* Sticky header: title + pill tabs */}
      <div className="sticky top-0 z-40 bg-white">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-3">
          <h1 className="text-[19px] font-semibold tracking-[-0.6px] text-[#1A1A1A]">
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
