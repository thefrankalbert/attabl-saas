'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { logger } from '@/lib/logger';

interface CreateOrderInput {
  tenant_id: string;
  table_number: string;
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
    mutationFn: async (input: CreateOrderInput) => {
      // Build the API payload (only fields the server expects)
      const payload = {
        tenant_id: input.tenant_id,
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
        })),
      };

      const response = await fetch('/api/orders/pos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Handle non-JSON responses (HTML error pages, redirects, etc.)
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(
          `API returned ${response.status} (${response.statusText}). Response: ${text.slice(0, 200)}`,
        );
      }

      const data: POSOrderResponse = await response.json();

      if (!response.ok) {
        const message = data.error || `Erreur ${response.status}`;
        const details = data.details ? ` (${data.details.join(', ')})` : '';
        throw new Error(`${message}${details}`);
      }

      return data;
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
    retry: (failureCount, error) => {
      if (failureCount >= 3) return false;
      const message = error instanceof Error ? error.message : '';
      // Do not retry validation or business logic errors
      if (
        message.includes('duplicate') ||
        message.includes('violates') ||
        message.includes('validation') ||
        message.includes('invalide') ||
        message.includes('disponible') ||
        message.includes('refuse')
      ) {
        return false;
      }
      return true;
    },
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10000),
  });
}
