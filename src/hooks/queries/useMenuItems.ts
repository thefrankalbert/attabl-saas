'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { buildMenuItemsSelect, fetchMenuItemsList } from '@/lib/menu-items-query';
import type { MenuItem, Category } from '@/types/admin.types';

type MenuItemWithCategory = MenuItem & { category?: Category };

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
    /** Load price variants and modifiers (POS). Admin list can skip for a lighter query. */
    withVariants?: boolean;
    initialData?: MenuItemWithCategory[];
  },
) {
  const availableOnly = options?.availableOnly ?? false;
  const categoryId = options?.categoryId;
  const availableFilter = options?.availableFilter;
  const withCategory = options?.withCategory ?? false;
  const withVariants = options?.withVariants ?? true;

  const selectClause = buildMenuItemsSelect({ withCategory, withVariants });

  return useQuery<MenuItemWithCategory[]>({
    queryKey: [
      'menu-items',
      tenantId,
      availableOnly,
      categoryId,
      availableFilter,
      withCategory,
      withVariants,
    ],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await fetchMenuItemsList(
        supabase,
        tenantId,
        selectClause,
        { availableOnly, categoryId, availableFilter },
        { withCategory, withVariants },
      );

      if (error) throw error;
      return data as unknown as MenuItemWithCategory[];
    },
    enabled: !!tenantId,
    staleTime: 3 * 60 * 1000,
    initialData: options?.initialData,
  });
}
