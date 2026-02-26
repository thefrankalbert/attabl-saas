'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

interface PaginatedQueryOptions {
  /** TanStack Query key prefix */
  queryKey: unknown[];
  /** Supabase table name */
  table: string;
  /** Select clause (defaults to '*') */
  select?: string;
  /** Base filters applied to every query, e.g. { tenant_id: 'abc' } */
  filters?: Record<string, unknown>;
  /** Column to order by */
  orderBy?: string;
  /** Ascending order (defaults to false → desc) */
  ascending?: boolean;
  /** Items per page (defaults to 50) */
  pageSize?: number;
  /** Whether the query is enabled */
  enabled?: boolean;
}

interface PaginatedResult<T> {
  data: T[];
  isLoading: boolean;
  error: Error | null;
  page: number;
  pageSize: number;
  totalCount: number;
  pageCount: number;
  setPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  canNextPage: boolean;
  canPrevPage: boolean;
  refetch: () => void;
}

/**
 * Server-side paginated query hook using Supabase `.range()`.
 * Returns paginated data + navigation helpers.
 */
export function usePaginatedQuery<T>(options: PaginatedQueryOptions): PaginatedResult<T> {
  const {
    queryKey,
    table,
    select = '*',
    filters = {},
    orderBy = 'created_at',
    ascending = false,
    pageSize = 50,
    enabled = true,
  } = options;

  const [page, setPage] = useState(0);

  // Count query
  const { data: totalCount = 0 } = useQuery<number>({
    queryKey: [...queryKey, 'count', filters],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase.from(table).select('*', { count: 'exact', head: true });

      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      }

      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
    enabled,
  });

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  // Data query with range
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const {
    data = [],
    isLoading,
    error,
    refetch,
  } = useQuery<T[]>({
    queryKey: [...queryKey, 'page', page, pageSize, filters],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase.from(table).select(select).order(orderBy, { ascending }).range(from, to);

      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      }

      const { data: rows, error: queryError } = await query;
      if (queryError) throw queryError;
      return (rows as T[]) ?? [];
    },
    enabled,
  });

  const canNextPage = page < pageCount - 1;
  const canPrevPage = page > 0;

  const nextPage = useCallback(() => {
    setPage((p) => Math.min(p + 1, pageCount - 1));
  }, [pageCount]);

  const prevPage = useCallback(() => {
    setPage((p) => Math.max(p - 1, 0));
  }, []);

  return useMemo(
    () => ({
      data,
      isLoading,
      error: error as Error | null,
      page,
      pageSize,
      totalCount,
      pageCount,
      setPage,
      nextPage,
      prevPage,
      canNextPage,
      canPrevPage,
      refetch,
    }),
    [
      data,
      isLoading,
      error,
      page,
      pageSize,
      totalCount,
      pageCount,
      nextPage,
      prevPage,
      canNextPage,
      canPrevPage,
      refetch,
    ],
  );
}
