'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Ingredient } from '@/types/inventory.types';
import { queryTimeoutSignal } from './query-timeout';

/**
 * Fetch active ingredients for a tenant, ordered by name.
 * Matches the query in inventory.service.ts getIngredients().
 */
export function useIngredients(tenantId: string) {
  return useQuery<Ingredient[]>({
    queryKey: ['ingredients', tenantId],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from('ingredients')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name');
      const signal = queryTimeoutSignal();
      if (signal) query = query.abortSignal(signal);

      const { data, error } = await query;

      if (error) throw error;
      return (data as Ingredient[]) ?? [];
    },
    enabled: !!tenantId,
    // Une seule reprise: l'ecran affiche l'erreur et "Reessayer" au lieu de
    // rester sur "Chargement..." pendant les 3 reprises par defaut.
    retry: 1,
    staleTime: 2 * 60 * 1000,
  });
}
