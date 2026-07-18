'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { submitOrder } from '@/lib/offline/submit-order';

interface UpdateOrderStatusInput {
  orderId: string;
  status: string;
}

/**
 * Mutation to update an order's status.
 *
 * Routes through the durable outbox (submitOrder -> /api/orders/mutations): on a
 * network/transient failure the status change is queued (idempotency-keyed) and
 * replayed on reconnect, so a cashier can mark an order ready/served/paid or
 * cancel it during an outage without losing the action. Invalidates orders and
 * dashboard-stats queries on success.
 */
export function useUpdateOrderStatus(tenantId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const tc = useTranslations('common');

  return useMutation({
    mutationKey: ['update-order-status', tenantId],
    mutationFn: async ({ orderId, status }: UpdateOrderStatusInput) => {
      const result = await submitOrder({
        endpoint: '/api/orders/mutations',
        body: { type: 'status', orderId, status },
        clientRequestId: crypto.randomUUID(),
      });
      if (result.status === 'sent' || result.status === 'queued') {
        return { success: true, queued: result.status === 'queued' };
      }
      // 'rejected' (server refused) or 'failed' (could not send nor queue).
      throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats', tenantId] });
    },
    onError: (error: Error) => {
      toast({ title: tc('error'), description: error.message, variant: 'destructive' });
    },
    // No TanStack retry: transient failures are durably queued by submitOrder and
    // replayed idempotently; the only errors that throw are server rejections,
    // which must not be retried.
    retry: false,
  });
}
