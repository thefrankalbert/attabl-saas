import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import OrdersClient from '@/components/admin/OrdersClient';
import { AlertCircle } from 'lucide-react';
import type { Order, ItemStatus, Course } from '@/types/admin.types';

export const dynamic = 'force-dynamic';

export default async function OrdersPage({ params }: { params: Promise<{ site: string }> }) {
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
        <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-yellow-700">Tenant non trouvé</p>
        </div>
      </div>
    );
  }

  const { data: orders } = await supabase
    .from('orders')
    .select(
      '*, order_items(id, quantity, price_at_order, item_name, menu_item_id, notes, customer_notes, item_status, course)',
    )
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(100);

  // Transform order_items → items to match Order type
  const transformedOrders: Order[] = ((orders || []) as Array<Record<string, unknown>>).map(
    (order) => ({
      ...(order as unknown as Order),
      items: ((order.order_items as Array<Record<string, unknown>>) || []).map((oi) => ({
        id: oi.id as string,
        name: (oi.item_name as string) || 'Unknown',
        quantity: (oi.quantity as number) || 0,
        price: (oi.price_at_order as number) || 0,
        menu_item_id: oi.menu_item_id as string | undefined,
        notes: oi.notes as string | undefined,
        customer_notes: oi.customer_notes as string | undefined,
        item_status: oi.item_status as ItemStatus | undefined,
        course: oi.course as Course | undefined,
      })),
    }),
  );

  return (
    <OrdersClient
      tenantId={tenant.id}
      initialOrders={transformedOrders}
      notificationSoundId={tenant.notification_sound_id}
    />
  );
}
