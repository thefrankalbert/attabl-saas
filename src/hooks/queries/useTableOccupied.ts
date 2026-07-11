'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

/**
 * Is the scanned table already holding an OPEN session (a likely other party)?
 *
 * The storefront is anonymous and cannot read table_sessions directly (RLS), so
 * this calls the is_table_occupied SECURITY DEFINER RPC which returns only a
 * boolean for one (tenant, table) pair. Used to softly warn a customer, never to
 * block ordering. Disabled when there is no table (takeaway / no-table tenants).
 */
export function useTableOccupied(tenantId: string, tableNumber?: string) {
  return useQuery<boolean>({
    queryKey: ['table-occupied', tenantId, tableNumber],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('is_table_occupied', {
        p_tenant_id: tenantId,
        p_table_number: tableNumber,
      });
      if (error) throw error;
      return data === true;
    },
    enabled: !!tenantId && !!tableNumber,
    // A soft hint - a short cache is plenty and avoids hammering on every render.
    staleTime: 30 * 1000,
    retry: false,
  });
}
