'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { mapStockMovementRow } from '@/services/inventory.service';
import type { StockMovement } from '@/types/inventory.types';

const PAGE_SIZE = 200;

interface StockMovementsPage {
  rows: StockMovement[];
  /** Exact total row count for the tenant (RPC COUNT(*) OVER(), before LIMIT). */
  totalCount: number | null;
}

/**
 * Fetch stock movements for a tenant, paginated (offset-based, newest first).
 * Uses the get_stock_movements_page RPC which flattens ingredient/supplier
 * joins and includes author_name via admin_users lookup - something the
 * PostgREST .select() cannot do (no FK between created_by and admin_users).
 */
export function useStockMovements(tenantId: string) {
  const query = useInfiniteQuery({
    queryKey: ['stock-movements', tenantId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<StockMovementsPage> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('get_stock_movements_page', {
        p_tenant_id: tenantId,
        p_limit: PAGE_SIZE,
        p_offset: (pageParam as number) * PAGE_SIZE,
      });

      if (error) throw error;
      const rawRows = (data as Record<string, unknown>[]) ?? [];
      // COUNT(*) OVER() rides on every row; read it before mapping (mapped
      // StockMovement drops it). Empty first page => 0, empty later page => null.
      const totalCount = rawRows.length
        ? Number(rawRows[0].total_count)
        : pageParam === 0
          ? 0
          : null;
      return { rows: rawRows.map(mapStockMovementRow), totalCount };
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.rows.length === PAGE_SIZE ? allPages.length : undefined,
    enabled: !!tenantId,
    staleTime: 2 * 60 * 1000,
  });

  const pages = query.data?.pages;

  return {
    data: (pages?.flatMap((page) => page.rows) ?? []) as StockMovement[],
    totalCount: pages?.length ? pages[pages.length - 1].totalCount : null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
