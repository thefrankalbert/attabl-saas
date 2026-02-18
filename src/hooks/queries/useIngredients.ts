'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Ingredient } from '@/types/inventory.types';

/**
 * Fetch active ingredients for a tenant, ordered by name.
 * Matches the query in inventory.service.ts getIngredients().
 */
export function useIngredients(tenantId: string) {
  return useQuery<Ingredient[]>({
    queryKey: ['ingredients', tenantId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('ingredients')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return (data as Ingredient[]) ?? [];
    },
    enabled: !!tenantId,
  });
}
