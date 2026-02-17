import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import POSClient from '@/components/admin/POSClient';
import { AlertCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function POSPage({ params }: { params: Promise<{ site: string }> }) {
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
      <div className="h-screen bg-neutral-50 flex items-center justify-center p-8">
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl max-w-md">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-red-700 font-bold">Tenant non trouvé</h3>
            <p className="text-red-600/70 text-sm mt-1">
              Impossible de charger le POS pour ce restaurant.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <POSClient tenantId={tenant.id} />;
}
