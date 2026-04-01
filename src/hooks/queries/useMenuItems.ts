'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { MenuItem, Category } from '@/types/admin.types';

type MenuItemWithCategory = MenuItem & { categories?: Category };

/**
 * Fetch all menu items for a tenant, with optional category join.
 * Matches the query used in ItemsClient and POSClient.
 */
export function useMenuItems(
  tenantId: string,
  options?: {
    availableOnly?: boolean;
    categoryId?: string;
    availableFilter?: string;
    withCategory?: boolean;
  },
) {
  const availableOnly = options?.availableOnly ?? false;
  const categoryId = options?.categoryId;
  const availableFilter = options?.availableFilter;
  const withCategory = options?.withCategory ?? false;

  return useQuery<MenuItemWithCategory[]>({
    queryKey: ['menu-items', tenantId, availableOnly, categoryId, availableFilter, withCategory],
    queryFn: async () => {
      const supabase = createClient();
      const baseSelect = '*, item_price_variants(*), item_modifiers(*)';
      let query = supabase
        .from('menu_items')
        .select(withCategory ? `${baseSelect}, categories(id, name)` : baseSelect)
        .eq('tenant_id', tenantId);

      if (availableOnly) {
        query = query.eq('is_available', true);
      }

      if (categoryId && categoryId !== 'all') {
        query = query.eq('category_id', categoryId);
      }

      if (availableFilter && availableFilter !== 'all') {
        query = query.eq('is_available', availableFilter === 'available');
      }

      query = query.order('name');

      const { data, error } = await query;
      if (error) throw error;

      // Map joined relation names to MenuItem field names
      const mapItem = (item: Record<string, unknown>) => ({
        ...item,
        price_variants: item.item_price_variants ?? [],
        modifiers: item.item_modifiers ?? [],
        ...(withCategory ? { category: item.categories as Category } : {}),
      });

      // Supabase join type gap
      return ((data || []) as unknown as Record<string, unknown>[]).map(
        mapItem,
      ) as MenuItemWithCategory[];
    },
    enabled: !!tenantId,
    staleTime: 3 * 60 * 1000,
  });
}
