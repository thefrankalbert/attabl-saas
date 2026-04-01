'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Order, ItemStatus, Course } from '@/types/admin.types';

/**
 * Fetch orders for a tenant, with optional status filter.
 * Includes order_items joined. Ordered by created_at desc, limited to 200.
 */
export function useOrders(tenantId: string, statusFilter?: string) {
  return useQuery<Order[]>({
    queryKey: ['orders', tenantId, statusFilter],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from('orders')
        .select(
          '*, order_items(id, quantity, price_at_order, item_name, menu_item_id, customer_notes, item_status, course), server:admin_users!orders_server_id_fkey(id, full_name)',
        )
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Transform order_items → items to match Order type
      return ((data || []) as Array<Record<string, unknown>>).map((order) => ({
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
      }));
    },
    enabled: !!tenantId,
    staleTime: 0,
    refetchInterval: 15_000,
  });
}
