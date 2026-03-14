import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import POSClient from '@/components/admin/POSClient';
import TenantNotFound from '@/components/admin/TenantNotFound';

export const dynamic = 'force-dynamic';

export default async function POSPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  return <POSClient tenantId={tenant.id} />;
}
