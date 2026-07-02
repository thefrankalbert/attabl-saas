'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { logger } from '@/lib/logger';
import { submitOrder } from '@/lib/offline/submit-order';

interface CreateOrderInput {
  tenant_id?: string; // Deprecated: tenant_id is now derived server-side from session
  /** Idempotency key minted at order compose. Survives the network-retry/outbox replay. */
  clientRequestId: string;
  /** Absent for tableless orders (takeaway, delivery, room service, counter sales). */
  table_number?: string;
  status: 'pending' | 'delivered';
  service_type: string;
  room_number?: string;
  delivery_address?: string;
  payment_method?: string;
  tip_amount?: number;
  notes?: string;
  coupon_code?: string;
  items: {
    menu_item_id: string;
    quantity: number;
    customer_notes?: string | null;
    modifiers?: Array<{ name: string; price: number }>;
    selected_variant?: string;
  }[];
  // Legacy fields kept for caller compatibility but not sent to API
  total?: number;
  cashier_id?: string | null;
  server_id?: string | null;
}

interface POSOrderResponse {
  success: boolean;
  orderId: string;
  orderNumber: string;
  total: number;
  error?: string;
  details?: string[];
  /** True when the network was unreachable and the order was durably queued to sync later. */
  queued?: boolean;
}

/**
 * Mutation to create a POS order via the server-side API route.
 *
 * All price verification, tax calculation, order number generation,
 * and inventory destock are handled server-side.
 *
 * Automatically invalidates orders and dashboard-stats queries on success.
 * Includes retry logic for transient network failures.
 */
export function useCreateOrder(tenantId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const tc = useTranslations('common');

  return useMutation({
    mutationKey: ['create-order', tenantId],
    mutationFn: async (input: CreateOrderInput): Promise<POSOrderResponse> => {
      // Build the API payload (only fields the server expects). The idempotency
      // key (client_request_id) is injected by submitOrder.
      const payload = {
        // tenant_id derived server-side from session (not sent from client)
        table_number: input.table_number,
        status: input.status,
        service_type: input.service_type,
        room_number: input.room_number,
        delivery_address: input.delivery_address,
        payment_method: input.payment_method,
        tip_amount: input.tip_amount,
        notes: input.notes,
        coupon_code: input.coupon_code,
        items: input.items.map((item) => ({
          menu_item_id: item.menu_item_id,
          quantity: item.quantity,
          customer_notes: item.customer_notes || undefined,
          modifiers: item.modifiers,
          selected_variant: item.selected_variant,
        })),
      };

      // submitOrder handles the durable outbox: on a network/transient failure it
      // queues the order (idempotency-keyed) and reports 'queued' instead of
      // throwing, so an offline tablet never loses or duplicates the order.
      const result = await submitOrder({
        endpoint: '/api/orders/pos',
        body: payload,
        clientRequestId: input.clientRequestId,
      });

      if (result.status === 'sent') {
        return result.data as POSOrderResponse;
      }
      if (result.status === 'queued') {
        return { success: true, queued: true, orderId: '', orderNumber: '', total: 0 };
      }
      // 'rejected' (server refused) or 'failed' (could not send nor queue):
      // surface to onError.
      const detail =
        result.status === 'rejected' && result.details ? ` (${result.details.join(', ')})` : '';
      throw new Error(`${result.error}${detail}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats', tenantId] });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
            ? String((error as { message: string }).message)
            : String(error);
      logger.error('Failed to create POS order', { message });
      toast({ title: tc('error'), description: message, variant: 'destructive' });
    },
    // No TanStack retry: transient network failures are durably queued by
    // submitOrder (and replayed idempotently by the outbox), and the only errors
    // that now throw are server rejections, which must not be retried.
    retry: false,
  });
}
