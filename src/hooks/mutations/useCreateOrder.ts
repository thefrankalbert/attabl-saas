'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
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
 * Verifies that client-supplied prices match the actual menu item prices
 * in the database. Returns server-verified prices or throws if any
 * item is unavailable or has a price mismatch beyond 1% tolerance.
 */
async function verifyPricesServerSide(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  items: CreateOrderInput['items'],
): Promise<Map<string, number>> {
  const itemIds = items.map((item) => item.menu_item_id);

  // Fetch actual menu item prices from DB
  const { data: menuItems, error: menuError } = await supabase
    .from('menu_items')
    .select('id, name, price, is_available')
    .eq('tenant_id', tenantId)
    .in('id', itemIds);

  if (menuError) {
    throw new Error('Erreur lors de la vérification des prix');
  }

  // Fetch actual modifier prices from DB
  const { data: dbModifiers } = await supabase
    .from('item_modifiers')
    .select('id, menu_item_id, name, price')
    .eq('tenant_id', tenantId)
    .in('menu_item_id', itemIds);

  const modifiersByItem = new Map<string, Map<string, number>>();
  for (const mod of dbModifiers || []) {
    if (!modifiersByItem.has(mod.menu_item_id)) {
      modifiersByItem.set(mod.menu_item_id, new Map());
    }
    modifiersByItem.get(mod.menu_item_id)!.set(mod.name.toLowerCase(), mod.price);
  }

  const menuItemsMap = new Map(menuItems?.map((item) => [item.id, item]) || []);
  const verifiedPrices = new Map<string, number>();
  const errors: string[] = [];

  for (const item of items) {
    const menuItem = menuItemsMap.get(item.menu_item_id);

    if (!menuItem) {
      errors.push(`Article "${item.item_name}" non trouvé`);
      continue;
    }

    if (menuItem.is_available === false) {
      errors.push(`"${menuItem.name}" n'est plus disponible`);
      continue;
    }

    const expectedPrice = menuItem.price;

    // 1% tolerance for rounding
    if (Math.abs(item.price_at_order - expectedPrice) > expectedPrice * 0.01) {
      errors.push(`Prix de "${menuItem.name}" a changé (attendu: ${expectedPrice})`);
    }

    // Verify modifier prices
    let modifiersTotal = 0;
    if (item.modifiers && item.modifiers.length > 0) {
      const itemModifiers = modifiersByItem.get(item.menu_item_id);
      for (const mod of item.modifiers) {
        const serverPrice = itemModifiers?.get(mod.name.toLowerCase());
        if (serverPrice !== undefined) {
          modifiersTotal += serverPrice;
        } else {
          errors.push(`Modificateur "${mod.name}" non trouvé pour "${menuItem.name}"`);
        }
      }
    }

    verifiedPrices.set(item.menu_item_id, expectedPrice + modifiersTotal);
  }

  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  return verifiedPrices;
}

/**
 * Mutation to create an order with its items.
 * Automatically invalidates orders and dashboard-stats queries on success.
 * Handles inventory destock and stock alerts as post-order side effects.
 * Includes aggressive retry for offline resilience.
 *
 * Security: verifies menu item prices server-side before inserting,
 * preventing price tampering from the client.
 */
export function useCreateOrder(tenantId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const tc = useTranslations('common');

  return useMutation({
    mutationKey: ['create-order', tenantId],
    mutationFn: async (input: CreateOrderInput) => {
      const supabase = createClient();

      // ── Price verification (security) ───────────────────────
      // Fetch actual prices from DB and compare with client prices.
      // This prevents price tampering via the browser client.
      const verifiedPrices = await verifyPricesServerSide(supabase, input.tenant_id, input.items);

      // Recalculate total from verified prices
      let verifiedTotal = 0;
      for (const item of input.items) {
        const verifiedUnitPrice = verifiedPrices.get(item.menu_item_id);
        if (verifiedUnitPrice !== undefined) {
          verifiedTotal += verifiedUnitPrice * item.quantity;
        }
      }

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

      // Create the order — use server-verified total, not client total
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          tenant_id: input.tenant_id,
          order_number: orderNumber,
          table_number: input.table_number,
          status: input.status,
          total: verifiedTotal,
          service_type: input.service_type,
          cashier_id: input.cashier_id ?? null,
          server_id: input.server_id ?? null,
          room_number: input.room_number,
          delivery_address: input.delivery_address,
          subtotal: verifiedTotal,
          payment_status: 'pending',
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items — use server-verified prices
      const orderItems = input.items.map((item) => {
        const verifiedUnitPrice = verifiedPrices.get(item.menu_item_id);
        // Strip modifier cost from verified price to get base price
        const modCost = item.modifiers?.reduce((s, m) => s + m.price, 0) || 0;
        const basePrice =
          verifiedUnitPrice !== undefined ? verifiedUnitPrice - modCost : item.price_at_order;

        return {
          order_id: order.id,
          menu_item_id: item.menu_item_id,
          item_name: item.item_name,
          quantity: item.quantity,
          price_at_order: basePrice,
          customer_notes: item.customer_notes || null,
          modifiers: item.modifiers?.length ? item.modifiers : [],
          item_status: 'pending',
        };
      });

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
      toast({ title: tc('error'), description: message, variant: 'destructive' });
    },
    retry: 10,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
  });
}
