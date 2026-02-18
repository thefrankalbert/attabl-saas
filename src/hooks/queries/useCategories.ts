'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Category } from '@/types/admin.types';

type CategoryWithCount = Category & { items_count?: number };

/**
 * Fetch categories for a tenant, ordered by display_order.
 * Optionally includes item count (matching CategoriesClient query).
 */
export function useCategories(tenantId: string, options?: { withItemCount?: boolean }) {
  const withItemCount = options?.withItemCount ?? false;

  return useQuery<CategoryWithCount[]>({
    queryKey: ['categories', tenantId, withItemCount],
    queryFn: async () => {
      const supabase = createClient();
      const selectClause = withItemCount ? '*, menu_items(id)' : '*';
      const { data, error } = await supabase
        .from('categories')
        .select(selectClause)
        .eq('tenant_id', tenantId)
        .order('display_order', { ascending: true });

      if (error) throw error;

      if (withItemCount) {
        return ((data || []) as unknown as Record<string, unknown>[]).map((cat) => ({
          ...cat,
          items_count: (cat.menu_items as unknown[])?.length || 0,
        })) as CategoryWithCount[];
      }

      return (data as unknown as CategoryWithCount[]) ?? [];
    },
    enabled: !!tenantId,
  });
}
