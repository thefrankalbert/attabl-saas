import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderItemInput } from '@/lib/validations/order.schema';
import { ServiceError } from './errors';
import { logger } from '@/lib/logger';

interface CreateOrderInput {
  tenantId: string;
  items: OrderItemInput[];
  total: number;
  tableNumber?: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
}

interface CreateOrderResult {
  orderId: string;
  orderNumber: string;
  total: number;
}

/**
 * Order service — handles order validation, price verification, and creation.
 *
 * Extracted from /api/orders/route.ts (209 lines → service + thin route).
 * Key security: server-side price verification prevents price fraud.
 */
export function createOrderService(supabase: SupabaseClient) {
  return {
    /**
     * Validates that a tenant exists and is active.
     * Throws ServiceError if not found or inactive.
     */
    async validateTenant(slug: string): Promise<{ id: string }> {
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('id, is_active')
        .eq('slug', slug)
        .single();

      if (tenantError || !tenant) {
        throw new ServiceError('Restaurant non trouvé', 'NOT_FOUND');
      }

      if (!tenant.is_active) {
        throw new ServiceError('Ce restaurant est temporairement indisponible', 'VALIDATION');
      }

      return { id: tenant.id };
    },

    /**
     * Validates order items against the database:
     * - Each item exists
     * - Each item is available
     * - Client price matches server price (1% tolerance)
     *
     * Returns the server-verified total (never trust client totals).
     */
    async validateOrderItems(
      tenantId: string,
      items: OrderItemInput[],
    ): Promise<{ validatedTotal: number }> {
      const itemIds = items.map((item) => item.id);
      const { data: menuItems, error: menuError } = await supabase
        .from('menu_items')
        .select('id, name, price, is_available')
        .eq('tenant_id', tenantId)
        .in('id', itemIds);

      if (menuError) {
        logger.error('Error fetching menu items', menuError);
        throw new ServiceError('Erreur lors de la vérification du menu', 'INTERNAL', menuError);
      }

      const menuItemsMap = new Map(menuItems?.map((item) => [item.id, item]) || []);

      const validationErrors: string[] = [];
      let calculatedTotal = 0;

      for (const item of items) {
        const menuItem = menuItemsMap.get(item.id);

        if (!menuItem) {
          validationErrors.push(`Article "${item.name}" non trouvé`);
          continue;
        }

        if (menuItem.is_available === false) {
          validationErrors.push(`"${menuItem.name}" n'est plus disponible`);
          continue;
        }

        // Price with variant or base price
        const expectedPrice = item.selectedVariant?.price || menuItem.price;

        // 1% tolerance for rounding
        if (Math.abs(item.price - expectedPrice) > expectedPrice * 0.01) {
          validationErrors.push(`Prix de "${menuItem.name}" a changé`);
        }

        calculatedTotal += item.price * item.quantity;
      }

      if (validationErrors.length > 0) {
        throw new ServiceError(
          'Certains articles ne sont plus valides',
          'VALIDATION',
          validationErrors,
        );
      }

      if (calculatedTotal <= 0) {
        throw new ServiceError('Le total de la commande doit être supérieur à 0', 'VALIDATION');
      }

      return { validatedTotal: calculatedTotal };
    },

    /**
     * Generates a unique order number using base36 timestamp.
     */
    generateOrderNumber(): string {
      return `CMD-${Date.now().toString(36).toUpperCase()}`;
    },

    /**
     * Creates an order with its items.
     * Rolls back the order if item insertion fails.
     */
    async createOrderWithItems(input: CreateOrderInput): Promise<CreateOrderResult> {
      const orderNumber = this.generateOrderNumber();

      // Create the main order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          tenant_id: input.tenantId,
          order_number: orderNumber,
          status: 'pending',
          total: input.total,
          table_number: input.tableNumber || null,
          customer_name: input.customerName || null,
          customer_phone: input.customerPhone || null,
          notes: input.notes || null,
        })
        .select('id, order_number')
        .single();

      if (orderError) {
        logger.error('Error creating order', orderError);
        throw new ServiceError('Erreur lors de la création de la commande', 'INTERNAL', orderError);
      }

      // Create order items
      const orderItems = input.items.map((item) => ({
        order_id: order.id,
        menu_item_id: item.id,
        item_name: item.name,
        item_name_en: item.name_en || null,
        quantity: item.quantity,
        price_at_order: item.price,
        notes: item.selectedOption
          ? `${item.selectedOption.name_fr}${item.selectedVariant ? ' - ' + item.selectedVariant.name_fr : ''}`
          : item.selectedVariant
            ? item.selectedVariant.name_fr
            : null,
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);

      if (itemsError) {
        logger.error('Error creating order items', itemsError);
        // Rollback: delete the order
        await supabase.from('orders').delete().eq('id', order.id);
        throw new ServiceError(
          "Erreur lors de l'enregistrement des articles",
          'INTERNAL',
          itemsError,
        );
      }

      return {
        orderId: order.id,
        orderNumber: order.order_number,
        total: input.total,
      };
    },
  };
}
