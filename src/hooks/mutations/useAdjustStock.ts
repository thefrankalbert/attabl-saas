'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { createInventoryService } from '@/services/inventory.service';
import { useToast } from '@/components/ui/use-toast';
import type { MovementType } from '@/types/inventory.types';

interface AdjustStockInput {
  ingredient_id: string;
  quantity: number;
  movement_type: MovementType;
  notes?: string;
  supplier_id?: string;
}

/**
 * Mutation to adjust stock for an ingredient.
 * Automatically invalidates ingredients, stock-movements, and dashboard-stats queries.
 */
export function useAdjustStock(tenantId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationKey: ['adjust-stock', tenantId],
    mutationFn: async (input: AdjustStockInput) => {
      const supabase = createClient();
      const inventoryService = createInventoryService(supabase);
      return inventoryService.adjustStock(tenantId, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats', tenantId] });
    },
    onError: (error: Error) => {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    },
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });
}
