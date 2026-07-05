import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreateMenuInput, UpdateMenuInput } from '@/lib/validations/menu.schema';
import type { MenuService } from './menu.service.types';
import {
  getAllMenusFlat,
  getCategoriesForMenu,
  getItemsForMenu,
  getMenuBySlug,
  getMenuDetailBundle,
  getMenusByTenant,
  getMenuWithChildren,
  getTransversalMenusByTenant,
} from './menu.queries';
import { createMenu, deleteMenu, reorderMenus, updateMenu } from './menu.mutations';

/**
 * Menu/Carte Service - factory orchestrator.
 *
 * Manages the menu hierarchy: Tenant → Venue → Menu (carte) → Category → Item
 * Supports sous-cartes via parent_menu_id (self-referencing FK).
 *
 * Read helpers live in ./menu.queries, write helpers in ./menu.mutations,
 * shared types/interface in ./menu.service.types.
 */

export type {
  MenuRow,
  MenuVenueRef,
  MenuChildRef,
  MenuWithRelations,
  CategoryWithItemRefs,
  MenuService,
} from './menu.service.types';

export function createMenuService(supabase: SupabaseClient): MenuService {
  return {
    getMenusByTenant: (tenantId) => getMenusByTenant(supabase, tenantId),
    getAllMenusFlat: (tenantId) => getAllMenusFlat(supabase, tenantId),
    getTransversalMenusByTenant: (tenantId) => getTransversalMenusByTenant(supabase, tenantId),
    getMenuWithChildren: (tenantId, menuId) => getMenuWithChildren(supabase, tenantId, menuId),
    getMenuBySlug: (tenantId, slug) => getMenuBySlug(supabase, tenantId, slug),
    createMenu: (tenantId, input: CreateMenuInput) => createMenu(supabase, tenantId, input),
    updateMenu: (tenantId, input: UpdateMenuInput) => updateMenu(supabase, tenantId, input),
    deleteMenu: (menuId, tenantId) => deleteMenu(supabase, menuId, tenantId),
    reorderMenus: (tenantId, orderedIds) => reorderMenus(supabase, tenantId, orderedIds),
    getCategoriesForMenu: (tenantId, menuId) => getCategoriesForMenu(supabase, tenantId, menuId),
    getItemsForMenu: (tenantId, menuId) => getItemsForMenu(supabase, tenantId, menuId),
    getMenuDetailBundle: (tenantId, menuId) => getMenuDetailBundle(supabase, tenantId, menuId),
  };
}
