'use client';

import { useSessionState } from '@/hooks/useSessionState';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { useMenus } from '@/hooks/queries';
import { useToast } from '@/components/ui/use-toast';
import { useSubscription } from '@/contexts/SubscriptionContext';
import {
  actionCreateMenu,
  actionUpdateMenu,
  actionDeleteMenu,
  actionReorderMenus,
} from '@/app/actions/menus';
import type { Menu } from '@/types/admin.types';

// ─── Types ──────────────────────────────────────────────

export interface MenuFormData {
  name: string;
  name_en?: string;
  description?: string;
  description_en?: string;
  venue_id: string | null;
  parent_menu_id: string | null;
  is_active: boolean;
  is_transversal_menu?: boolean;
}

/** Async confirmation callback — typically from useConfirmDialog. */
export type ConfirmFn = (message: string) => Promise<boolean>;

interface UseMenusDataParams {
  tenantId: string;
  initialMenus: Menu[];
  /** No-window.confirm fallback. */
  confirm: ConfirmFn;
}

export interface UseMenusDataReturn {
  menus: Menu[];
  loading: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isLimitReached: boolean;
  maxMenus: number;
  createMenu: (data: MenuFormData) => Promise<Menu | null>;
  updateMenu: (menuId: string, data: MenuFormData) => Promise<void>;
  deleteMenu: (menu: Menu) => Promise<void>;
  deleteMultiple: (menuIds: string[]) => Promise<void>;
  toggleActive: (menu: Menu) => Promise<void>;
  reorder: (dragIndex: number, dropIndex: number) => Promise<void>;
  loadMenus: () => void;
}

// ─── Hook ───────────────────────────────────────────────

export function useMenusData({
  tenantId,
  initialMenus,
  confirm,
}: UseMenusDataParams): UseMenusDataReturn {
  const [searchQuery, setSearchQuery] = useSessionState('menus:searchQuery', '');

  const { toast } = useToast();
  const { isLimitReached: checkLimit, limits } = useSubscription();
  const queryClient = useQueryClient();
  const t = useTranslations('menus');
  const tc = useTranslations('common');

  // TanStack Query for menus
  const { data: menus = initialMenus, isLoading: loading } = useMenus(tenantId, initialMenus);

  const loadMenus = () => {
    queryClient.invalidateQueries({ queryKey: ['menus', tenantId] });
  };

  // ─── CRUD ───────────────────────────────────────────

  const createMenu = async (data: MenuFormData): Promise<Menu | null> => {
    const result = await actionCreateMenu(tenantId, {
      name: data.name.trim(),
      name_en: data.name_en?.trim() || undefined,
      description: data.description?.trim() || undefined,
      description_en: data.description_en?.trim() || undefined,
      venue_id: data.venue_id,
      parent_menu_id: data.parent_menu_id,
      is_active: data.is_active,
      is_transversal_menu: data.is_transversal_menu ?? false,
      display_order: menus.length,
    });
    if (result.error) {
      toast({ title: result.error, variant: 'destructive' });
      throw new Error(result.error);
    }
    toast({ title: t('menuCreated') });
    loadMenus();
    return (result.data as Menu) ?? null;
  };

  const updateMenu = async (menuId: string, data: MenuFormData) => {
    const result = await actionUpdateMenu(tenantId, {
      id: menuId,
      name: data.name.trim(),
      name_en: data.name_en?.trim() || undefined,
      description: data.description?.trim() || undefined,
      description_en: data.description_en?.trim() || undefined,
      venue_id: data.venue_id,
      parent_menu_id: data.parent_menu_id,
      is_active: data.is_active,
      is_transversal_menu: data.is_transversal_menu ?? false,
    });
    if (result.error) {
      toast({ title: result.error, variant: 'destructive' });
      throw new Error(result.error);
    }
    toast({ title: t('menuUpdated') });
    loadMenus();
  };

  const deleteMenu = async (menu: Menu) => {
    const ok = await confirm(t('deleteConfirm', { name: menu.name }));
    if (!ok) return;

    try {
      const result = await actionDeleteMenu(tenantId, menu.id);
      if (result.error) {
        toast({ title: result.error, variant: 'destructive' });
        return;
      }
      toast({ title: t('menuDeleted') });
      loadMenus();
    } catch {
      toast({ title: t('deleteError'), variant: 'destructive' });
    }
  };

  const deleteMultiple = async (menuIds: string[]) => {
    if (menuIds.length === 0) return;
    const ok = await confirm(t('deleteMultipleConfirm', { count: menuIds.length }));
    if (!ok) return;

    let errors = 0;
    for (const id of menuIds) {
      try {
        const result = await actionDeleteMenu(tenantId, id);
        if (result.error) errors++;
      } catch {
        errors++;
      }
    }
    if (errors > 0) {
      toast({ title: t('deleteError'), variant: 'destructive' });
    } else {
      toast({ title: t('menuDeleted') });
    }
    loadMenus();
  };

  const toggleActive = async (menu: Menu) => {
    try {
      const result = await actionUpdateMenu(tenantId, {
        id: menu.id,
        is_active: !menu.is_active,
      });
      if (result.error) {
        toast({ title: result.error, variant: 'destructive' });
        return;
      }
      loadMenus();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  const reorder = async (dragIndex: number, dropIndex: number) => {
    const previous = menus;
    const reordered = [...menus];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    // Optimistic update in query cache
    queryClient.setQueryData(['menus', tenantId], reordered);

    try {
      const orderedIds = reordered.map((m) => m.id);
      const result = await actionReorderMenus(tenantId, orderedIds);
      if (result.error) {
        // Rollback on server error
        queryClient.setQueryData(['menus', tenantId], previous);
        toast({ title: result.error, variant: 'destructive' });
      }
    } catch {
      // Rollback on network/unexpected error
      queryClient.setQueryData(['menus', tenantId], previous);
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  // ─── Derived data ─────────────────────────────────────

  const limitReached = checkLimit('maxMenus', menus.length);

  return {
    menus,
    loading,
    searchQuery,
    setSearchQuery,
    isLimitReached: limitReached,
    maxMenus: limits.maxMenus,
    createMenu,
    updateMenu,
    deleteMenu,
    deleteMultiple,
    toggleActive,
    reorder,
    loadMenus,
  };
}
