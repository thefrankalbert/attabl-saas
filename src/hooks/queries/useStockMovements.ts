'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { StockMovement } from '@/types/inventory.types';

/**
 * Fetch stock movements for a tenant.
 * Matches the query in inventory.service.ts getStockMovements().
 */
export function useStockMovements(tenantId: string) {
  return useQuery<StockMovement[]>({
    queryKey: ['stock-movements', tenantId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('stock_movements')
        .select('*, ingredient:ingredients(name, unit), supplier:suppliers(id, name)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      return (data as StockMovement[]) ?? [];
    },
    enabled: !!tenantId,
  });
}
