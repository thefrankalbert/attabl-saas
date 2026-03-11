import { getCachedTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import { AlertCircle } from 'lucide-react';
import StockHistoryClient from '@/components/admin/StockHistoryClient';

export const revalidate = 60;

export default async function StockHistoryPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getCachedTenant(tenantSlug);

  if (!tenant) {
    return (
      <div className="p-8">
        <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-yellow-600">Tenant non trouvé</p>
        </div>
      </div>
    );
  }

  return <StockHistoryClient tenantId={tenant.id} />;
}
