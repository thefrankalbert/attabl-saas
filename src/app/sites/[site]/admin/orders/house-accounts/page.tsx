import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import HouseAccountsClient from '@/components/admin/HouseAccountsClient';
import TenantNotFound from '@/components/admin/TenantNotFound';
import type { CurrencyCode } from '@/types/admin.types';

export const dynamic = 'force-dynamic';

export default async function HouseAccountsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  const currency = (tenant.currency as CurrencyCode | undefined) ?? 'XAF';

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <HouseAccountsClient tenantId={tenant.id} currency={currency} />
    </div>
  );
}
