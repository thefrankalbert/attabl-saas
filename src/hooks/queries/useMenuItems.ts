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
      let query = supabase
        .from('menu_items')
        .select(withCategory ? '*, categories(id, name)' : '*')
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

      if (withCategory) {
        return ((data || []) as unknown as Record<string, unknown>[]).map((item) => ({
          ...item,
          category: item.categories as Category,
        })) as MenuItemWithCategory[];
      }

      return (data as unknown as MenuItemWithCategory[]) ?? [];
    },
    enabled: !!tenantId,
  });
}
