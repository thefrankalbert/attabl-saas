'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { actionAdjustStock } from '@/app/actions/inventory';
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
  const tc = useTranslations('common');

  return useMutation({
    mutationKey: ['adjust-stock', tenantId],
    mutationFn: async (input: AdjustStockInput) => {
      const r = await actionAdjustStock(tenantId, input);
      if (r.error) throw new Error(r.error);
      return r;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats', tenantId] });
    },
    onError: (error: Error) => {
      toast({ title: tc('error'), description: error.message, variant: 'destructive' });
    },
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });
}
