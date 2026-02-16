import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import AdsClient from '@/components/admin/AdsClient';
import { AlertCircle } from 'lucide-react';
import type { Ad } from '@/types/admin.types';

export const dynamic = 'force-dynamic';

export default async function AdsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const supabase = await createClient();
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
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

  const { data: ads } = await supabase
    .from('ads')
    .select('*')
    .eq('tenant_id', tenant.id)
    .order('sort_order', { ascending: true });

  return <AdsClient tenantId={tenant.id} initialAds={(ads as Ad[]) || []} />;
}
