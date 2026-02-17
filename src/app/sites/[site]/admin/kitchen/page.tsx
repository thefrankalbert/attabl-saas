import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import KitchenClient from '@/components/admin/KitchenClient';
import { AlertCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function KitchenPage({ params }: { params: Promise<{ site: string }> }) {
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
      <div className="h-screen bg-neutral-950 flex items-center justify-center p-8">
        <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl max-w-md">
          <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-amber-500 font-bold">Tenant non trouvé</h3>
            <p className="text-amber-500/70 text-sm mt-1">
              Impossible de charger le KDS pour ce restaurant.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <KitchenClient
      tenantId={tenant.id}
      notificationSoundId={tenant.notification_sound_id ?? undefined}
    />
  );
}
