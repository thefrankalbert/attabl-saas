'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { StockMovement } from '@/types/inventory.types';

const PAGE_SIZE = 200;

interface StockMovementsPage {
  rows: StockMovement[];
  /** Exact total row count for the tenant (from PostgREST count: 'exact'). */
  totalCount: number | null;
}

/**
 * Fetch stock movements for a tenant, paginated (keyset by offset, newest first).
 * Returns the flattened list plus load-more controls so the history view is not
 * silently capped at a single page, and the exact dataset total so consumers
 * (header count pill) do not misreport the number of loaded pages as the total.
 */
export function useStockMovements(tenantId: string) {
  const query = useInfiniteQuery({
    queryKey: ['stock-movements', tenantId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<StockMovementsPage> => {
      const supabase = createClient();
      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await supabase
        .from('stock_movements')
        .select('*, ingredient:ingredients(name, unit), supplier:suppliers(id, name)', {
          count: 'exact',
        })
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return { rows: (data as StockMovement[]) ?? [], totalCount: count };
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.rows.length === PAGE_SIZE ? allPages.length : undefined,
    enabled: !!tenantId,
    staleTime: 2 * 60 * 1000,
  });

  const pages = query.data?.pages;

  return {
    data: (pages?.flatMap((page) => page.rows) ?? []) as StockMovement[],
    // Latest fetched page carries the freshest count.
    totalCount: pages?.length ? pages[pages.length - 1].totalCount : null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
