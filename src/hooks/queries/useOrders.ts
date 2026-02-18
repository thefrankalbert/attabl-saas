'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Order } from '@/types/admin.types';

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
        .select('*, order_items(*)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as Order[]) ?? [];
    },
    enabled: !!tenantId,
  });
}
