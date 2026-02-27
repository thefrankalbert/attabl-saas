'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Table } from '@/types/admin.types';

/**
 * Fetch tables for a tenant, ordered by table_number.
 * Optionally filter by zone_id or active status.
 */
export function useTables(tenantId: string, options?: { zoneId?: string; activeOnly?: boolean }) {
  const zoneId = options?.zoneId;
  const activeOnly = options?.activeOnly ?? false;

  return useQuery<Table[]>({
    queryKey: ['tables', tenantId, zoneId, activeOnly],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from('tables')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('table_number');

      if (zoneId) {
        query = query.eq('zone_id', zoneId);
      }

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as Table[]) ?? [];
    },
    enabled: !!tenantId,
    staleTime: 10 * 60 * 1000,
  });
}
