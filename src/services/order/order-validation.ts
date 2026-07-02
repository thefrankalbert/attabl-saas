import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderItemInput } from '@/lib/validations/order.schema';
import type { OrderPreparationZone, PreparationZone } from '@/types/admin.types';
import { ServiceError } from '../errors';
import { logger } from '@/lib/logger';
import { fetchMenuItemsByIds } from '@/lib/menu-items-query';
import type { OrderPreviewIssue, OrderPreviewResult } from './order-types';

export function createValidationMethods(supabase: SupabaseClient) {
  return {
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

      // Index modifiers/variants BOTH by stable id and by name (audit H4). The
      // server prefers the id when the cart carries one (collision/rename-proof)
      // and falls back to name for legacy carts saved before ids were sent.
      const { data: dbModifiers } = modifiersRes;
      const modifiersByItem = new Map<string, Map<string, number>>();
      const modifiersByItemId = new Map<string, Map<string, number>>();
      for (const mod of dbModifiers || []) {
        if (!modifiersByItem.has(mod.menu_item_id)) {
          modifiersByItem.set(mod.menu_item_id, new Map());
        }
        modifiersByItem.get(mod.menu_item_id)!.set(mod.name.toLowerCase(), mod.price);
        if (mod.id) {
          if (!modifiersByItemId.has(mod.menu_item_id)) {
            modifiersByItemId.set(mod.menu_item_id, new Map());
          }
          modifiersByItemId.get(mod.menu_item_id)!.set(mod.id, mod.price);
        }
      }

      const { data: dbVariants } = variantsRes;
      const variantsByItem = new Map<string, Map<string, number>>();
      const variantsByItemId = new Map<string, Map<string, number>>();
      for (const v of dbVariants || []) {
        if (!variantsByItem.has(v.menu_item_id)) {
          variantsByItem.set(v.menu_item_id, new Map());
        }
        variantsByItem.get(v.menu_item_id)!.set(v.variant_name_fr.toLowerCase(), v.price);
        if (v.id) {
          if (!variantsByItemId.has(v.menu_item_id)) {
            variantsByItemId.set(v.menu_item_id, new Map());
          }
          variantsByItemId.get(v.menu_item_id)!.set(v.id, v.price);
        }
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
          const variantById = item.selectedVariant.id
            ? variantsByItemId.get(item.id)?.get(item.selectedVariant.id)
            : undefined;
          const serverVariantPrice =
            variantById ??
            variantsByItem.get(item.id)?.get(item.selectedVariant.name_fr.toLowerCase());
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

        // Verify modifier prices server-side (id-preferred, name fallback)
        const itemModifiers = modifiersByItem.get(item.id);
        const itemModifiersById = modifiersByItemId.get(item.id);
        let modifiersTotal = 0;
        if (item.modifiers && item.modifiers.length > 0) {
          for (const mod of item.modifiers) {
            const modById = mod.id ? itemModifiersById?.get(mod.id) : undefined;
            const serverPrice = modById ?? itemModifiers?.get(mod.name.toLowerCase());
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
  };
}
