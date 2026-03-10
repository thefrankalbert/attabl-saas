import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderItemInput } from '@/lib/validations/order.schema';
import type { ServiceType } from '@/types/admin.types';
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
  // ─── Production upgrade ────────────────────────────────
  service_type?: ServiceType;
  room_number?: string;
  delivery_address?: string;
  subtotal?: number;
  tax_amount?: number;
  service_charge_amount?: number;
  discount_amount?: number;
  tip_amount?: number;
  coupon_id?: string;
  server_id?: string;
  display_currency?: string;
  verifiedPrices?: Map<string, number>;
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
    ): Promise<{ validatedTotal: number; verifiedPrices: Map<string, number> }> {
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

      // Fetch server-side modifier prices for all items
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

      // Fetch server-side variant prices for all items
      const { data: dbVariants } = await supabase
        .from('item_price_variants')
        .select('id, menu_item_id, variant_name_fr, price')
        .eq('tenant_id', tenantId)
        .in('menu_item_id', itemIds);

      const variantsByItem = new Map<string, Map<string, number>>();
      for (const v of dbVariants || []) {
        if (!variantsByItem.has(v.menu_item_id)) {
          variantsByItem.set(v.menu_item_id, new Map());
        }
        variantsByItem.get(v.menu_item_id)!.set(v.variant_name_fr.toLowerCase(), v.price);
      }

      const menuItemsMap = new Map(menuItems?.map((item) => [item.id, item]) || []);

      const validationErrors: string[] = [];
      let calculatedTotal = 0;
      const verifiedPrices = new Map<string, number>();

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

        // Determine server-verified price: variant price from DB, or base item price
        let expectedPrice = menuItem.price;
        if (item.selectedVariant) {
          const itemVariants = variantsByItem.get(item.id);
          const serverVariantPrice = itemVariants?.get(item.selectedVariant.name_fr.toLowerCase());
          if (serverVariantPrice !== undefined) {
            expectedPrice = serverVariantPrice;
          } else {
            validationErrors.push(
              `Variante "${item.selectedVariant.name_fr}" non trouvée pour "${menuItem.name}"`,
            );
            continue;
          }
        }

        // 1% tolerance for rounding
        if (Math.abs(item.price - expectedPrice) > expectedPrice * 0.01) {
          validationErrors.push(`Prix de "${menuItem.name}" a changé`);
        }

        // Verify modifier prices server-side
        const itemModifiers = modifiersByItem.get(item.id);
        let modifiersTotal = 0;
        if (item.modifiers && item.modifiers.length > 0) {
          for (const mod of item.modifiers) {
            const serverPrice = itemModifiers?.get(mod.name.toLowerCase());
            if (serverPrice !== undefined) {
              // Use server price, not client price
              modifiersTotal += serverPrice;
            } else {
              // Modifier not found in DB — reject
              validationErrors.push(
                `Modificateur "${mod.name}" non trouvé pour "${menuItem.name}"`,
              );
            }
          }
        }

        // Use server-verified prices for total calculation
        verifiedPrices.set(item.id, expectedPrice);
        calculatedTotal += (expectedPrice + modifiersTotal) * item.quantity;
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

      return { validatedTotal: calculatedTotal, verifiedPrices };
    },

    /**
     * Generates a unique, sequential order number per tenant per day.
     * Uses PostgreSQL advisory locks to prevent race conditions.
     * Format: CMD-YYYYMMDD-001
     *
     * Falls back to timestamp-based if RPC unavailable.
     */
    async generateOrderNumber(tenantId: string): Promise<string> {
      try {
        const { data, error } = await supabase.rpc('next_order_number', {
          p_tenant_id: tenantId,
        });

        if (error || !data) {
          logger.warn('Order number RPC failed, using fallback', { rpcError: error?.message });
          return `CMD-${Date.now().toString(36).toUpperCase()}`;
        }

        return data as string;
      } catch {
        // Fallback to timestamp-based
        return `CMD-${Date.now().toString(36).toUpperCase()}`;
      }
    },

    /**
     * Creates an order with its items.
     * Rolls back the order if item insertion fails.
     */
    async createOrderWithItems(input: CreateOrderInput): Promise<CreateOrderResult> {
      const orderNumber = await this.generateOrderNumber(input.tenantId);

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
          // ─── Production upgrade ──────────────────────────────
          service_type: input.service_type || 'dine_in',
          room_number: input.room_number || null,
          delivery_address: input.delivery_address || null,
          subtotal: input.subtotal ?? input.total,
          tax_amount: input.tax_amount ?? 0,
          service_charge_amount: input.service_charge_amount ?? 0,
          discount_amount: input.discount_amount ?? 0,
          tip_amount: input.tip_amount ?? 0,
          payment_status: 'pending',
          coupon_id: input.coupon_id || null,
          server_id: input.server_id ?? null,
          display_currency: input.display_currency || null,
        })
        .select('id, order_number')
        .single();

      if (orderError) {
        logger.error('Error creating order', orderError);
        throw new ServiceError('Erreur lors de la création de la commande', 'INTERNAL', orderError);
      }

      // Create order items
      // DB columns: order_id, menu_item_id, item_name, item_name_en, quantity,
      //   price_at_order, customer_notes, modifiers, course, item_status, created_at
      const orderItems = input.items.map((item) => {
        // Build variant/option label to prepend to customer notes
        const parts: string[] = [];
        if (item.selectedVariant) parts.push(item.selectedVariant.name_fr);
        if (item.selectedOption) parts.push(item.selectedOption.name_fr);
        if (item.customerNotes) parts.push(item.customerNotes);
        const combinedNotes = parts.length > 0 ? parts.join(' · ') : null;

        return {
          order_id: order.id,
          menu_item_id: item.id,
          item_name: item.name,
          item_name_en: item.name_en || null,
          quantity: item.quantity,
          price_at_order: input.verifiedPrices?.get(item.id) ?? item.price,
          customer_notes: combinedNotes,
          modifiers: item.modifiers || [],
          course: item.course || null,
          item_status: 'pending',
        };
      });

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);

      if (itemsError) {
        logger.error('Error creating order items', itemsError);
        // Rollback: delete the order
        const { error: deleteError } = await supabase.from('orders').delete().eq('id', order.id);
        if (deleteError) {
          logger.error('Failed to rollback order', deleteError, { orderId: order.id });
        }
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
