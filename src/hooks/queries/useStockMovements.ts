'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { StockMovement } from '@/types/inventory.types';

const PAGE_SIZE = 200;

/**
 * Fetch stock movements for a tenant, paginated (keyset by offset, newest first).
 * Returns the flattened list plus load-more controls so the history view is not
 * silently capped at a single page.
 */
export function useStockMovements(tenantId: string) {
  const query = useInfiniteQuery({
    queryKey: ['stock-movements', tenantId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const supabase = createClient();
      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('stock_movements')
        .select('*, ingredient:ingredients(name, unit), supplier:suppliers(id, name)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return (data as StockMovement[]) ?? [];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.length : undefined,
    enabled: !!tenantId,
    staleTime: 2 * 60 * 1000,
  });

  return {
    data: (query.data?.pages.flat() ?? []) as StockMovement[],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
