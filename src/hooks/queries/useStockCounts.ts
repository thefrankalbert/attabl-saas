'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { createInventoryService } from '@/services/inventory.service';
import type { StockCount, StockCountLine } from '@/types/inventory.types';

/**
 * Fetch the list of stock counts for a tenant (newest first, limit 50).
 */
export function useStockCounts(tenantId: string) {
  return useQuery<StockCount[]>({
    queryKey: ['stock-counts', tenantId],
    queryFn: () => {
      const supabase = createClient();
      return createInventoryService(supabase).listStockCounts(tenantId);
    },
    enabled: !!tenantId,
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch a single stock count with its lines (lines sorted by ingredient name).
 */
export function useStockCount(tenantId: string, countId: string) {
  return useQuery<{ count: StockCount; lines: StockCountLine[] }>({
    queryKey: ['stock-count', tenantId, countId],
    queryFn: () => {
      const supabase = createClient();
      return createInventoryService(supabase).getStockCount(tenantId, countId);
    },
    enabled: !!tenantId && !!countId,
    staleTime: 30 * 1000,
  });
}
