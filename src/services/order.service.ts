import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderItemInput } from '@/lib/validations/order.schema';
import type { ServiceType, OrderPreparationZone, PreparationZone } from '@/types/admin.types';
import { ServiceError } from './errors';
import { logger } from '@/lib/logger';
import { fetchMenuItemsByIds } from '@/lib/menu-items-query';

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
  /** Idempotency key minted client-side. Dedupes offline-replayed order creation. */
  clientRequestId?: string;
}

interface CreateOrderResult {
  orderId: string;
  orderNumber: string;
  total: number;
  /**
   * True when the DB function returned an already-existing order for the
   * idempotency key (concurrent replay deduped at the unique index) instead of
   * inserting a new one. The caller MUST then skip non-idempotent side effects
   * (coupon claim, destock, notifications) - the winning request already ran them.
   */
  deduplicated?: boolean;
}

type OrderPreviewIssue = {
  itemId: string;
  message: string;
  /** Client should remove this line from the cart (deleted or unavailable item). */
  removeFromCart: boolean;
};

export type OrderPreviewResult = {
  valid: boolean;
  issues: OrderPreviewIssue[];
  invalidItemIds: string[];
  validatedSubtotal: number;
  verifiedPrices: Map<string, number>;
  categoryIds: string[];
  itemCategoryMap: Map<string, string>;
};

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
  /**
   * Close a table session once none of its orders are still awaiting payment
   * (every order paid or cancelled). Tenant-scoped. Best-effort: a failure here
   * must not fail the payment, so it only logs.
   */
  async function closeSessionIfFullySettled(sessionId: string, tenantId: string): Promise<void> {
    const { count, error } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('session_id', sessionId)
      .eq('payment_status', 'pending')
      .neq('status', 'cancelled');

    if (error) {
      logger.error('Failed to check session settlement', { sessionId, tenantId, error });
      return;
    }
    if ((count ?? 0) > 0) return; // still has unpaid orders -> keep open

    const { error: closeError } = await supabase
      .from('table_sessions')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('tenant_id', tenantId)
      .eq('status', 'open');
    if (closeError) {
      logger.error('Failed to close table session', { sessionId, tenantId, error: closeError });
    }
  }

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
        // Soft-deleted tenants accept no orders, independently of is_active.
        .is('deleted_at', null)
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
     * Pre-validates cart items without creating an order.
     * Returns structured issues so the client can drop stale lines before checkout.
     */
    async previewOrderItems(
      tenantId: string,
      items: OrderItemInput[],
    ): Promise<OrderPreviewResult> {
      const itemIds = items.map((item) => item.id);

      // Run all three independent queries in parallel (biggest latency win)
      const [menuItemsRes, modifiersRes, variantsRes] = await Promise.all([
        fetchMenuItemsByIds(
          supabase,
          tenantId,
          itemIds,
          'id, name, price, is_available, category_id',
        ),
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

      const menuItemsMap = new Map(
        (menuItems || []).map((item) => {
          const row = item as {
            id: string;
            name: string;
            price: number;
            is_available: boolean;
            category_id: string | null;
          };
          return [row.id, row] as const;
        }),
      );

      const issues: OrderPreviewIssue[] = [];
      const invalidItemIds: string[] = [];
      let calculatedTotal = 0;
      const verifiedPrices = new Map<string, number>();

      for (const item of items) {
        if (item.quantity < 1) {
          issues.push({
            itemId: item.id,
            message: `Quantite invalide pour "${item.name}"`,
            removeFromCart: true,
          });
          invalidItemIds.push(item.id);
          continue;
        }

        const menuItem = menuItemsMap.get(item.id);

        if (!menuItem) {
          issues.push({
            itemId: item.id,
            message: `Article "${item.name}" non trouve`,
            removeFromCart: true,
          });
          invalidItemIds.push(item.id);
          continue;
        }

        if (menuItem.is_available === false) {
          issues.push({
            itemId: item.id,
            message: `"${menuItem.name}" n'est plus disponible`,
            removeFromCart: true,
          });
          invalidItemIds.push(item.id);
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
            issues.push({
              itemId: item.id,
              message: `Variante "${item.selectedVariant.name_fr}" non trouvee pour "${menuItem.name}"`,
              removeFromCart: false,
            });
            continue;
          }
        }

        if (Math.abs(item.price - expectedPrice) > 1) {
          issues.push({
            itemId: item.id,
            message: `Prix de "${menuItem.name}" a change`,
            removeFromCart: false,
          });
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
              issues.push({
                itemId: item.id,
                message: `Modificateur "${mod.name}" non trouve pour "${menuItem.name}"`,
                removeFromCart: false,
              });
            }
          }
        }

        const itemHasBlockingIssue = issues.some(
          (issue) => issue.itemId === item.id && !issue.removeFromCart,
        );
        const itemRemoved = invalidItemIds.includes(item.id);
        if (!itemRemoved && !itemHasBlockingIssue) {
          verifiedPrices.set(item.id, expectedPrice);
          calculatedTotal += (expectedPrice + modifiersTotal) * item.quantity;
        }
      }

      const categoryIds = new Set<string>();
      const itemCategoryMap = new Map<string, string>();
      for (const item of items) {
        if (invalidItemIds.includes(item.id)) continue;
        const menuItem = menuItemsMap.get(item.id);
        if (menuItem?.category_id) {
          categoryIds.add(menuItem.category_id);
          itemCategoryMap.set(item.id, menuItem.category_id);
        }
      }

      const valid = issues.length === 0 && calculatedTotal > 0 && invalidItemIds.length === 0;

      return {
        valid,
        issues,
        invalidItemIds,
        validatedSubtotal: calculatedTotal,
        verifiedPrices,
        categoryIds: Array.from(categoryIds),
        itemCategoryMap,
      };
    },

    /**
     * Validates order items against the database (throws on invalid cart).
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
      const preview = await this.previewOrderItems(tenantId, items);

      if (!preview.valid) {
        const messages = preview.issues.map((issue) => issue.message);
        throw new ServiceError(
          'Certains articles ne sont plus valides',
          'VALIDATION',
          messages.length > 0 ? messages : ['Panier invalide'],
        );
      }

      return {
        validatedTotal: preview.validatedSubtotal,
        verifiedPrices: preview.verifiedPrices,
        categoryIds: preview.categoryIds,
        itemCategoryMap: preview.itemCategoryMap,
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
        p_client_request_id: input.clientRequestId ?? null,
      });

      if (error) {
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

    /**
     * Update an order's status. Always filters by tenant_id for isolation.
     */
    async updateStatus(orderId: string, tenantId: string, status: string): Promise<void> {
      const { error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', orderId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new ServiceError('Erreur lors de la mise a jour du statut', 'INTERNAL', error);
      }
    },

    /**
     * Cancel an order AND reverse its side-effects (audit finding C7): restore
     * the ingredients that were destocked and release any single-use coupon it
     * consumed. Before this, cancelling only flipped status='cancelled' and left
     * stock deducted + the coupon burnt.
     *
     * Idempotent: re-cancelling an already-cancelled order is a no-op. A PAID
     * order cannot be plain-cancelled here - that requires a refund (Phase 4) so
     * the financial record is preserved; we throw CONFLICT instead of silently
     * reversing money. restock/unclaim are themselves idempotent, so a partial
     * failure can be safely retried.
     */
    async cancelOrder(orderId: string, tenantId: string): Promise<void> {
      const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('id, status, payment_status, coupon_id')
        .eq('id', orderId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (fetchError) {
        throw new ServiceError('Erreur lors du chargement de la commande', 'INTERNAL', fetchError);
      }
      if (!order) {
        throw new ServiceError('Commande introuvable', 'NOT_FOUND');
      }
      if (order.status === 'cancelled') {
        return; // already cancelled - no-op
      }
      if (order.payment_status === 'paid') {
        throw new ServiceError(
          'Une commande payee ne peut pas etre annulee - utiliser un remboursement',
          'CONFLICT',
        );
      }

      // Reverse side-effects first (both idempotent), then mark cancelled.
      const { error: restockError } = await supabase.rpc('restock_order', {
        p_order_id: orderId,
        p_tenant_id: tenantId,
      });
      if (restockError) {
        throw new ServiceError('Erreur lors du restockage', 'INTERNAL', restockError);
      }

      if (order.coupon_id) {
        const { error: unclaimError } = await supabase.rpc('unclaim_coupon_usage', {
          p_coupon_id: order.coupon_id,
        });
        if (unclaimError) {
          throw new ServiceError(
            'Erreur lors de la liberation du coupon',
            'INTERNAL',
            unclaimError,
          );
        }
      }

      const { error: updateError } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId)
        .eq('tenant_id', tenantId);
      if (updateError) {
        throw new ServiceError("Erreur lors de l'annulation", 'INTERNAL', updateError);
      }
    },

    /**
     * Mark an order as paid - updates payment_method, payment_status,
     * paid_at, status to 'delivered', and optionally tip_amount.
     * Always filters by tenant_id for isolation.
     *
     * NOTE: setting status='delivered' couples payment to fulfillment. This is a
     * deliberate, documented interim: decoupling into orthogonal fulfillment /
     * payment axes is Phase 3 of the order->payment refonte (audit C3). Removing
     * it now would leave paid orders lingering on the KDS active board, so it
     * stays until the fulfillment state machine lands.
     *
     * Idempotent: the update is scoped to payment_status='pending' (same guard as
     * the POS route applyPosFinalState). A double-tap / network retry on an
     * already-paid order matches 0 rows and is a no-op - it never re-stamps
     * paid_at nor overwrites the recorded tip. Returns whether the order was
     * actually flipped from pending to paid by this call.
     */
    async markPaid(
      orderId: string,
      tenantId: string,
      payload: { method: string; tipAmount?: number },
    ): Promise<{ paid: boolean }> {
      const update: Record<string, unknown> = {
        payment_method: payload.method,
        payment_status: 'paid',
        paid_at: new Date().toISOString(),
        status: 'delivered',
      };
      if (payload.tipAmount && payload.tipAmount > 0) {
        update.tip_amount = payload.tipAmount;
      }

      const { data, error } = await supabase
        .from('orders')
        .update(update)
        .eq('id', orderId)
        .eq('tenant_id', tenantId)
        .eq('payment_status', 'pending')
        .select('id, session_id');

      if (error) {
        throw new ServiceError('Erreur lors du paiement', 'INTERNAL', error);
      }

      const paidRow = Array.isArray(data) && data.length > 0 ? data[0] : null;

      // Close the table session once every order on it is settled (audit C1).
      // Leaving it open would let tomorrow's orders attach to today's check.
      if (paidRow?.session_id) {
        await closeSessionIfFullySettled(paidRow.session_id as string, tenantId);
      }

      return { paid: paidRow !== null };
    },

    /**
     * List orders in 'ready' status created since midnight for a tenant.
     * Used by the ServiceManager dashboard.
     */
    async listReadyOrdersToday(tenantId: string): Promise<unknown[]> {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('tenant_id', tenantId)
        .eq('status', 'ready')
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: true });
      if (error) {
        throw new ServiceError('Erreur chargement commandes pretes', 'INTERNAL', error);
      }
      return (data as unknown[]) || [];
    },

    /**
     * Return the current (not delivered, not cancelled) order for a
     * specific table, if any. Used by ServiceManager table detail panel.
     * Resolves table_number from tables.id (orders.table_id may be absent on older DBs).
     */
    async getCurrentOrderForTable(tenantId: string, tableId: string): Promise<unknown | null> {
      const { data: tableRow, error: tableError } = await supabase
        .from('tables')
        .select('table_number, display_name')
        .eq('id', tableId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (tableError) {
        throw new ServiceError(
          'Erreur chargement table pour commande courante',
          'INTERNAL',
          tableError,
        );
      }
      if (!tableRow) return null;

      const tableNumbers = Array.from(
        new Set(
          [tableRow.table_number, tableRow.display_name].filter(
            (value): value is string => typeof value === 'string' && value.length > 0,
          ),
        ),
      );
      if (tableNumbers.length === 0) return null;

      let query = supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('tenant_id', tenantId)
        .not('status', 'in', '(delivered,cancelled)')
        .order('created_at', { ascending: false })
        .limit(1);

      query =
        tableNumbers.length === 1
          ? query.eq('table_number', tableNumbers[0])
          : query.in('table_number', tableNumbers);

      const { data, error } = await query.maybeSingle();
      if (error) {
        throw new ServiceError(
          'Erreur chargement commande courante pour cette table',
          'INTERNAL',
          error,
        );
      }
      return data || null;
    },
  };
}
