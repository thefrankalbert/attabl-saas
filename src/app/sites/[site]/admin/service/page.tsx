import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import TenantNotFound from '@/components/admin/TenantNotFound';
import ServiceManager from '@/components/admin/ServiceManager';

export const dynamic = 'force-dynamic';

export default async function ServicePage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  return <ServiceManager tenantId={tenant.id} />;
}
