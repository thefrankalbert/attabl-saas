import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { AlertCircle } from 'lucide-react';
import InventoryClient from '@/components/admin/InventoryClient';

export const dynamic = 'force-dynamic';

export default async function InventoryPage({ params }: { params: Promise<{ site: string }> }) {
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
        <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-yellow-700">Tenant non trouvé</p>
        </div>
      </div>
    );
  }

  return <InventoryClient tenantId={tenant.id} currency={tenant.currency || 'XAF'} />;
}
