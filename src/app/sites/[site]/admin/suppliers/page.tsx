import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import TenantNotFound from '@/components/admin/TenantNotFound';
import SuppliersClient from '@/components/admin/SuppliersClient';

export const dynamic = 'force-dynamic';

export default async function SuppliersPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <SuppliersClient tenantId={tenant.id} />
    </div>
  );
}
