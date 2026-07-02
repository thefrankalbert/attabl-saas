import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from '../errors';
import { logger } from '@/lib/logger';
import { toMinorUnits } from '@/lib/utils/money';
import type { CreateOrderInput, CreateOrderResult } from './order-types';

export function createCreationMethods(supabase: SupabaseClient) {
  return {
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
     * Returns an existing order for a client-minted idempotency key, or null.
     * Used to short-circuit an offline-replayed order BEFORE any side effect
     * (coupon claim, order creation) so a replay never duplicates the order.
     */
    async findOrderByClientRequestId(
      tenantId: string,
      clientRequestId: string,
    ): Promise<CreateOrderResult | null> {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, total')
        .eq('tenant_id', tenantId)
        .eq('client_request_id', clientRequestId)
        .maybeSingle();

      if (error) {
        throw new ServiceError('Erreur lors de la verification de la commande', 'INTERNAL', error);
      }
      if (!data) return null;

      return {
        orderId: data.id as string,
        orderNumber: data.order_number as string,
        total: data.total as number,
      };
    },

    /**
     * Creates an order with its items atomically via a DB function.
     * The entire operation runs in a single PostgreSQL transaction -
     * if item insertion fails, the order is automatically rolled back.
     *
     * Idempotent when input.clientRequestId is set: a replay returns the
     * already-created order (the DB function dedupes on (tenant, key)).
     */
    async createOrderWithItems(input: CreateOrderInput): Promise<CreateOrderResult> {
      const orderNumber = await this.generateOrderNumber(input.tenantId);

      // Money crosses the boundary here: CreateOrderInput carries MAJOR-unit
      // amounts (menu prices, computed pricing) and the DB stores integer MINOR
      // units. Convert every transactional amount with the order's currency
      // (orders.display_currency; null -> default XAF, a 0-decimal identity).
      const currency = input.display_currency;

      // Build items array for the DB function
      const itemsJson = input.items.map((item) => {
        const parts: string[] = [];
        if (item.selectedVariant) parts.push(item.selectedVariant.name_fr);
        if (item.selectedOption) parts.push(item.selectedOption.name_fr);
        if (item.customerNotes) parts.push(item.customerNotes);
        const combinedNotes = parts.length > 0 ? parts.join(' - ') : null;

        return {
          menu_item_id: item.id,
          item_name: item.name,
          item_name_en: item.name_en || null,
          quantity: item.quantity,
          // price_at_order: server-verified MAJOR menu price -> integer minor units.
          price_at_order: toMinorUnits(input.verifiedPrices?.get(item.id) ?? item.price, currency),
          customer_notes: combinedNotes,
          modifiers: item.modifiers || [],
          course: item.course || null,
          preparation_zone: input.itemPreparationZones?.get(item.id) || 'kitchen',
        };
      });

      const { data, error } = await supabase.rpc('create_order_with_items', {
        p_tenant_id: input.tenantId,
        p_order_number: orderNumber,
        p_total: toMinorUnits(input.total, currency),
        p_table_number: input.tableNumber || null,
        p_customer_name: input.customerName || null,
        p_customer_phone: input.customerPhone || null,
        p_notes: input.notes || null,
        p_service_type: input.service_type || 'dine_in',
        p_room_number: input.room_number || null,
        p_delivery_address: input.delivery_address || null,
        p_subtotal: toMinorUnits(input.subtotal ?? input.total, currency),
        p_tax_amount: toMinorUnits(input.tax_amount ?? 0, currency),
        p_service_charge_amount: toMinorUnits(input.service_charge_amount ?? 0, currency),
        p_discount_amount: toMinorUnits(input.discount_amount ?? 0, currency),
        p_tip_amount: toMinorUnits(input.tip_amount ?? 0, currency),
        p_coupon_id: input.coupon_id || null,
        p_server_id: input.server_id ?? null,
        p_display_currency: input.display_currency || null,
        p_preparation_zone: input.preparation_zone || 'kitchen',
        p_items: itemsJson,
        p_client_request_id: input.clientRequestId ?? null,
      });

      if (error) {
        // DEPLOY-ORDERING: migration 20260629000600 (table_sessions) replaces the
        // RPC's TABLE_ACTIVE_ORDER raise with find-or-create-session, so this
        // handler is dead ONCE THAT MIGRATION IS LIVE. It is intentionally kept
        // until then: prod still runs the old RPC that raises TABLE_ACTIVE_ORDER,
        // and removing it now would degrade that error to a generic 500. Remove
        // this branch in the same release that applies migration 20260629000600.
        if (error.message?.includes('TABLE_ACTIVE_ORDER')) {
          throw new ServiceError(
            'Une commande est deja en cours sur cette table',
            'CONFLICT',
            error,
          );
        }
        logger.error('Atomic order creation failed', error);
        throw new ServiceError('Erreur lors de la creation de la commande', 'INTERNAL', error);
      }

      const result = data as {
        orderId: string;
        orderNumber: string;
        total: number;
        deduplicated?: boolean;
      };

      return {
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        total: result.total,
        deduplicated: result.deduplicated === true,
      };
    },
  };
}
