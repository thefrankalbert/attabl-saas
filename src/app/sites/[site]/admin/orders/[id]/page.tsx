import { createClient } from '@/lib/supabase/server';
import { getCachedTenant } from '@/lib/cache';
import { notFound } from 'next/navigation';
import SingleOrderClient from '@/components/admin/SingleOrderClient';
import type { Order } from '@/types/admin.types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ site: string; id: string }>;
}

export default async function SingleOrderPage({ params }: PageProps) {
  const { site, id } = await params;

  // Resolve tenant from site slug to scope the query
  const tenant = await getCachedTenant(site);

  if (!tenant) {
    notFound();
  }

  const supabase = await createClient();

  const { data: order } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', id)
    .eq('tenant_id', tenant.id)
    .single();

  if (!order) {
    notFound();
  }

  // Transform raw DB shape to match Order type
  const transformedOrder: Order = {
    id: order.id,
    tenant_id: order.tenant_id,
    table_number: order.table_number || 'N/A',
    status: order.status || 'pending',
    total_price: Number(order.total || 0),
    created_at: order.created_at,
    server_id: order.server_id,
    service_type: order.service_type,
    payment_status: order.payment_status,
    payment_method: order.payment_method,
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
    notes: order.notes,
    items: ((order.order_items as Array<Record<string, unknown>>) || []).map(
      (item: Record<string, unknown>) => ({
        id: (item.id as string) || '',
        name: (item.item_name as string) || 'Item inconnu',
        quantity: (item.quantity as number) || 0,
        price: (item.price_at_order as number) || 0,
      }),
    ),
  };

  return <SingleOrderClient order={transformedOrder} />;
}
