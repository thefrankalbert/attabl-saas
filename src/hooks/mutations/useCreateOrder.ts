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
  total_price: number;
  service_type: string;
  cashier_id?: string | null;
  server_id?: string | null;
  room_number?: string;
  delivery_address?: string;
  items: {
    menu_item_id: string;
    quantity: number;
    price_at_order: number;
    notes?: string | null;
    name: string;
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

      // Create the order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          tenant_id: input.tenant_id,
          table_number: input.table_number,
          status: input.status,
          total_price: input.total_price,
          service_type: input.service_type,
          cashier_id: input.cashier_id ?? null,
          server_id: input.server_id ?? null,
          room_number: input.room_number,
          delivery_address: input.delivery_address,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = input.items.map((item) => ({
        tenant_id: input.tenant_id,
        order_id: order.id,
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        price_at_order: item.price_at_order,
        notes: item.notes || null,
        name: item.name,
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
    onError: (error: Error) => {
      logger.error('Failed to create order', error);
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    },
    retry: 10,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
  });
}
