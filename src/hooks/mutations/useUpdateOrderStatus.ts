'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { actionUpdateOrderStatus } from '@/app/actions/orders';

interface UpdateOrderStatusInput {
  orderId: string;
  status: string;
}

/**
 * Mutation to update an order's status via server action.
 * Automatically invalidates orders and dashboard-stats queries on success.
 */
export function useUpdateOrderStatus(tenantId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const tc = useTranslations('common');

  return useMutation({
    mutationKey: ['update-order-status', tenantId],
    mutationFn: async ({ orderId, status }: UpdateOrderStatusInput) => {
      const result = await actionUpdateOrderStatus(tenantId, orderId, status);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats', tenantId] });
    },
    onError: (error: Error) => {
      toast({ title: tc('error'), description: error.message, variant: 'destructive' });
    },
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });
}
