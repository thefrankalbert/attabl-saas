import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import TenantNotFound from '@/components/admin/TenantNotFound';
import StockHistoryClient from '@/components/admin/StockHistoryClient';
import { requireAdminPermission } from '@/lib/auth/require-admin-permission';

export const dynamic = 'force-dynamic';

export default async function StockHistoryPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  await requireAdminPermission(site, 'inventory.view');
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  return (
    <div className="max-w-7xl xl:max-w-[90rem] 2xl:max-w-[100rem] mx-auto">
      <StockHistoryClient tenantId={tenant.id} />
    </div>
  );
}
