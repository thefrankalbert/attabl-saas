'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { createInventoryService } from '@/services/inventory.service';
import { logger } from '@/lib/logger';

interface CreateOrderInput {
  tenant_id: string;
  table_number: string;
  status: string;
  total: number;
  service_type: string;
  cashier_id?: string | null;
  server_id?: string | null;
  room_number?: string;
  delivery_address?: string;
  items: {
    menu_item_id: string;
    quantity: number;
    price_at_order: number;
    customer_notes?: string | null;
    item_name: string;
    modifiers?: Array<{ name: string; price: number }>;
  }[];
}

/**
 * Mutation to create an order with its items.
 * Automatically invalidates orders and dashboard-stats queries on success.
 * Handles inventory destock and stock alerts as post-order side effects.
 * Includes aggressive retry for offline resilience.
 */
export function useCreateOrder(tenantId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationKey: ['create-order', tenantId],
    mutationFn: async (input: CreateOrderInput) => {
      const supabase = createClient();

      // Generate order number (same logic as order.service.ts)
      let orderNumber: string;
      try {
        const { data, error } = await supabase.rpc('next_order_number', {
          p_tenant_id: input.tenant_id,
        });
        if (error || !data) {
          orderNumber = `CMD-${Date.now().toString(36).toUpperCase()}`;
        } else {
          orderNumber = data as string;
        }
      } catch {
        orderNumber = `CMD-${Date.now().toString(36).toUpperCase()}`;
      }

      // Create the order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          tenant_id: input.tenant_id,
          order_number: orderNumber,
          table_number: input.table_number,
          status: input.status,
          total: input.total,
          service_type: input.service_type,
          cashier_id: input.cashier_id ?? null,
          server_id: input.server_id ?? null,
          room_number: input.room_number,
          delivery_address: input.delivery_address,
          subtotal: input.total,
          payment_status: 'pending',
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = input.items.map((item) => ({
        order_id: order.id,
        menu_item_id: item.menu_item_id,
        item_name: item.item_name,
        quantity: item.quantity,
        price_at_order: item.price_at_order,
        customer_notes: item.customer_notes || null,
        modifiers: item.modifiers?.length ? item.modifiers : [],
        item_status: 'pending',
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
      if (itemsError) throw itemsError;

      // Auto-destock inventory (non-blocking — order succeeds even if destock fails)
      const inventoryService = createInventoryService(supabase);
      inventoryService.destockOrder(order.id, input.tenant_id).catch(() => {});

      // Check stock alerts (non-blocking, fire-and-forget)
      fetch('/api/stock-alerts/check', { method: 'POST' }).catch(() => {});

      return order;
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
      logger.error('Failed to create order', { message, error });
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    },
    retry: 10,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
  });
}
