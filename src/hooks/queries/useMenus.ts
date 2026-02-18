'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Menu } from '@/types/admin.types';

/**
 * Fetch menus for a tenant, including venue and children sub-menus.
 * Matches the query in MenusClient loadMenus().
 */
export function useMenus(tenantId: string, initialData?: Menu[]) {
  return useQuery<Menu[]>({
    queryKey: ['menus', tenantId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('menus')
        .select(
          '*, venue:venues(id, name, slug), children:menus!parent_menu_id(id, name, name_en, slug, is_active, display_order)',
        )
        .eq('tenant_id', tenantId)
        .is('parent_menu_id', null)
        .order('display_order', { ascending: true });

      if (error) throw error;
      return (data as Menu[]) ?? [];
    },
    enabled: !!tenantId,
    initialData,
  });
}
