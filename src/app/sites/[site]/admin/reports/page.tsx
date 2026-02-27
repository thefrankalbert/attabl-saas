import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import dynamic from 'next/dynamic';
import { AlertCircle } from 'lucide-react';

const ReportsClient = dynamic(() => import('@/components/admin/ReportsClient'), {
  loading: () => (
    <div className="p-12 text-center text-neutral-500 animate-pulse">
      Chargement des rapports...
    </div>
  ),
});

export const revalidate = 300;

export default async function ReportsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const supabase = await createClient();
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const { data: tenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', tenantSlug)
    .single();

  if (!tenant) {
    return (
      <div className="p-8">
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl max-w-md">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-red-700 font-bold">Tenant non trouvé</h3>
          </div>
        </div>
      </div>
    );
  }

  return <ReportsClient tenantId={tenant.id} currency={tenant.currency || 'XAF'} />;
}
