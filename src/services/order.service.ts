import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderItemInput } from '@/lib/validations/order.schema';
import type { ServiceType, OrderPreparationZone, PreparationZone } from '@/types/admin.types';
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
  preparation_zone?: OrderPreparationZone;
  /** Per-item preparation zone, keyed by menu_item_id. Denormalized from category at order time. */
  itemPreparationZones?: Map<string, PreparationZone>;
}

interface CreateOrderResult {
  orderId: string;
  orderNumber: string;
  total: number;
}

interface TenantValidationResult {
  id: string;
  currency: string | null;
  tax_rate: number | null;
  service_charge_rate: number | null;
  enable_tax: boolean | null;
  enable_service_charge: boolean | null;
  subscription_plan: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
}

/**
 * Order service - handles order validation, price verification, and creation.
 *
 * Extracted from /api/orders/route.ts (209 lines → service + thin route).
 * Key security: server-side price verification prevents price fraud.
 */
export function createOrderService(supabase: SupabaseClient) {
  return {
    /**
     * Validates that a tenant exists and is active.
     * Also returns tenant config (currency, tax, subscription) to avoid a second round-trip.
     * Throws ServiceError if not found or inactive.
     */
    async validateTenant(slug: string): Promise<TenantValidationResult> {
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select(
          'id, is_active, currency, tax_rate, service_charge_rate, enable_tax, enable_service_charge, subscription_plan, subscription_status, trial_ends_at',
        )
        .eq('slug', slug)
        .single();

      if (tenantError || !tenant) {
        throw new ServiceError('Restaurant non trouvé', 'NOT_FOUND');
      }

      if (!tenant.is_active) {
        throw new ServiceError('Ce restaurant est temporairement indisponible', 'VALIDATION');
      }

      return {
        id: tenant.id,
        currency: tenant.currency ?? null,
        tax_rate: tenant.tax_rate ?? null,
        service_charge_rate: tenant.service_charge_rate ?? null,
        enable_tax: tenant.enable_tax ?? null,
        enable_service_charge: tenant.enable_service_charge ?? null,
        subscription_plan: tenant.subscription_plan ?? null,
        subscription_status: tenant.subscription_status ?? null,
        trial_ends_at: tenant.trial_ends_at ?? null,
      };
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
    ): Promise<{
      validatedTotal: number;
      verifiedPrices: Map<string, number>;
      categoryIds: string[];
      itemCategoryMap: Map<string, string>;
    }> {
      const itemIds = items.map((item) => item.id);

      // Run all three independent queries in parallel (biggest latency win)
      const [menuItemsRes, modifiersRes, variantsRes] = await Promise.all([
        supabase
          .from('menu_items')
          .select('id, name, price, is_available, category_id')
          .eq('tenant_id', tenantId)
          .in('id', itemIds),
        supabase
          .from('item_modifiers')
          .select('id, menu_item_id, name, price')
          .eq('tenant_id', tenantId)
          .in('menu_item_id', itemIds),
        supabase
          .from('item_price_variants')
          .select('id, menu_item_id, variant_name_fr, price')
          .eq('tenant_id', tenantId)
          .in('menu_item_id', itemIds),
      ]);

      const { data: menuItems, error: menuError } = menuItemsRes;
      if (menuError) {
        logger.error('Error fetching menu items', menuError);
        throw new ServiceError('Erreur lors de la vérification du menu', 'INTERNAL', menuError);
      }

      const { data: dbModifiers } = modifiersRes;
      const modifiersByItem = new Map<string, Map<string, number>>();
      for (const mod of dbModifiers || []) {
        if (!modifiersByItem.has(mod.menu_item_id)) {
          modifiersByItem.set(mod.menu_item_id, new Map());
        }
        modifiersByItem.get(mod.menu_item_id)!.set(mod.name.toLowerCase(), mod.price);
      }

      const { data: dbVariants } = variantsRes;
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
              // Modifier not found in DB - reject
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

      // Collect category IDs and build item->category map for preparation zone routing
      const categoryIds = new Set<string>();
      const itemCategoryMap = new Map<string, string>();
      for (const item of items) {
        const menuItem = menuItemsMap.get(item.id);
        if (menuItem?.category_id) {
          categoryIds.add(menuItem.category_id);
          itemCategoryMap.set(item.id, menuItem.category_id);
        }
      }

      return {
        validatedTotal: calculatedTotal,
        verifiedPrices,
        categoryIds: Array.from(categoryIds),
        itemCategoryMap,
      };
    },

    /**
     * Determines the preparation zone for an order based on its item categories.
     * - All items from 'bar' categories → 'bar'
     * - All items from 'kitchen' categories → 'kitchen'
     * - Mix of both (or any 'both' category) → 'mixed'
     */
    async determinePreparationZone(
      tenantId: string,
      categoryIds: string[],
    ): Promise<{
      orderZone: OrderPreparationZone;
      categoryZoneMap: Map<string, PreparationZone>;
    }> {
      const categoryZoneMap = new Map<string, PreparationZone>();

      if (categoryIds.length === 0) return { orderZone: 'kitchen', categoryZoneMap };

      const { data: categories } = await supabase
        .from('categories')
        .select('id, preparation_zone')
        .eq('tenant_id', tenantId)
        .in('id', categoryIds);

      if (!categories || categories.length === 0) return { orderZone: 'kitchen', categoryZoneMap };

      // Build category -> zone map
      for (const c of categories) {
        const zone = (c.preparation_zone as PreparationZone) || 'kitchen';
        categoryZoneMap.set(c.id as string, zone);
      }

      const zones = new Set(
        categories.map((c: { preparation_zone?: string }) => c.preparation_zone || 'kitchen'),
      );

      // If any category is 'both', the order is mixed
      let orderZone: OrderPreparationZone;
      if (zones.has('both')) {
        orderZone = 'mixed';
      } else if (zones.size === 1) {
        const zone = zones.values().next().value as string;
        orderZone = zone === 'bar' ? 'bar' : 'kitchen';
      } else {
        // Mix of 'kitchen' and 'bar'
        orderZone = 'mixed';
      }

      return { orderZone, categoryZoneMap };
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
     * Creates an order with its items atomically via a DB function.
     * The entire operation runs in a single PostgreSQL transaction -
     * if item insertion fails, the order is automatically rolled back.
     */
    async createOrderWithItems(input: CreateOrderInput): Promise<CreateOrderResult> {
      const orderNumber = await this.generateOrderNumber(input.tenantId);

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
          price_at_order: input.verifiedPrices?.get(item.id) ?? item.price,
          customer_notes: combinedNotes,
          modifiers: item.modifiers || [],
          course: item.course || null,
          preparation_zone: input.itemPreparationZones?.get(item.id) || 'kitchen',
        };
      });

      const { data, error } = await supabase.rpc('create_order_with_items', {
        p_tenant_id: input.tenantId,
        p_order_number: orderNumber,
        p_total: input.total,
        p_table_number: input.tableNumber || null,
        p_customer_name: input.customerName || null,
        p_customer_phone: input.customerPhone || null,
        p_notes: input.notes || null,
        p_service_type: input.service_type || 'dine_in',
        p_room_number: input.room_number || null,
        p_delivery_address: input.delivery_address || null,
        p_subtotal: input.subtotal ?? input.total,
        p_tax_amount: input.tax_amount ?? 0,
        p_service_charge_amount: input.service_charge_amount ?? 0,
        p_discount_amount: input.discount_amount ?? 0,
        p_tip_amount: input.tip_amount ?? 0,
        p_coupon_id: input.coupon_id || null,
        p_server_id: input.server_id ?? null,
        p_display_currency: input.display_currency || null,
        p_preparation_zone: input.preparation_zone || 'kitchen',
        p_items: itemsJson,
      });

      if (error) {
        logger.error('Atomic order creation failed', error);
        throw new ServiceError('Erreur lors de la creation de la commande', 'INTERNAL', error);
      }

      const result = data as { orderId: string; orderNumber: string; total: number };

      return {
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        total: result.total,
      };
    },
  };
}
