import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import OrdersClient from '@/components/admin/OrdersClient';
import TenantNotFound from '@/components/admin/TenantNotFound';
import { logger } from '@/lib/logger';
import {
  paginationQuerySchema,
  toSupabaseRange,
  type ServerListPagination,
} from '@/lib/pagination';
import type { Order, ItemStatus, Course } from '@/types/admin.types';

export const dynamic = 'force-dynamic';

const ORDERS_PAGE_SIZE = 50;

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ site: string }>;
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}) {
  const { site } = await params;
  const sp = await searchParams;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  const { page, pageSize } = paginationQuerySchema.parse({
    page: sp.page,
    pageSize: sp.pageSize ?? String(ORDERS_PAGE_SIZE),
  });
  const { from, to } = toSupabaseRange(page, pageSize);

  const supabase = await createClient();

  const orderSelect =
    '*, order_items(id, quantity, price_at_order, item_name, menu_item_id, customer_notes, item_status, course), server:admin_users!orders_server_id_fkey(id, full_name)';

  const {
    data: initialOrders,
    error: queryError,
    count,
  } = await supabase
    .from('orders')
    .select(orderSelect, { count: 'exact' })
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (queryError) {
    logger.error('Orders page: failed to fetch orders', {
      error: queryError.message,
      tenantId: tenant.id,
    });
  }

  const orders = initialOrders;

  // Transform order_items → items to match Order type
  const transformedOrders: Order[] = ((orders || []) as Array<Record<string, unknown>>).map(
    (order) => ({
      // Supabase join type gap
      ...(order as unknown as Order),
      items: ((order.order_items as Array<Record<string, unknown>>) || []).map((oi) => ({
        id: oi.id as string,
        name: (oi.item_name as string) || 'Unknown',
        quantity: (oi.quantity as number) || 0,
        price: (oi.price_at_order as number) || 0,
        menu_item_id: oi.menu_item_id as string | undefined,
        customer_notes: oi.customer_notes as string | undefined,
        item_status: oi.item_status as ItemStatus | undefined,
        course: oi.course as Course | undefined,
      })),
    }),
  );

  const serverListPagination: ServerListPagination = {
    page,
    pageSize,
    total: count ?? transformedOrders.length,
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden max-w-7xl xl:max-w-[90rem] 2xl:max-w-[100rem] mx-auto">
      <OrdersClient
        tenantId={tenant.id}
        initialOrders={transformedOrders}
        serverListPagination={serverListPagination}
      />
    </div>
  );
}
