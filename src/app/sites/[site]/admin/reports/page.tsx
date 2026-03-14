import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import { AlertCircle } from 'lucide-react';
import ReportsClient from '@/components/admin/ReportsClient';

export const dynamic = 'force-dynamic';

export default async function ReportsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return (
      <div className="p-8">
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl max-w-md">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-red-700 font-bold">Tenant non trouvé</h3>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <ReportsClient tenantId={tenant.id} currency={tenant.currency || 'XAF'} />
    </div>
  );
}
