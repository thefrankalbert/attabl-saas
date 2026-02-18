'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Supplier } from '@/types/supplier.types';

/**
 * Fetch suppliers for a tenant, ordered by name.
 * Matches the query in supplier.service.ts getSuppliers().
 */
export function useSuppliers(tenantId: string, options?: { activeOnly?: boolean }) {
  const activeOnly = options?.activeOnly ?? false;

  return useQuery<Supplier[]>({
    queryKey: ['suppliers', tenantId, activeOnly],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase.from('suppliers').select('*').eq('tenant_id', tenantId).order('name');

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as Supplier[]) ?? [];
    },
    enabled: !!tenantId,
  });
}
