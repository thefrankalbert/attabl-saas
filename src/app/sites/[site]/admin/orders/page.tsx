import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import OrdersClient from '@/components/admin/OrdersClient';
import { AlertCircle } from 'lucide-react';
import type { Order } from '@/types/admin.types';

export const dynamic = 'force-dynamic';

export default async function OrdersPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const supabase = await createClient();
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, notification_sound_id')
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

  const { data: orders } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <OrdersClient
      tenantId={tenant.id}
      initialOrders={(orders || []) as Order[]}
      notificationSoundId={tenant.notification_sound_id}
    />
  );
}
