import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreateMenuInput, UpdateMenuInput } from '@/lib/validations/menu.schema';
import type { MenuService } from './menu.service.types';
import { createMenu, deleteMenu, reorderMenus, updateMenu } from './menu.mutations';

/**
 * Menu/Carte Service - factory orchestrator.
 *
 * Manages the menu hierarchy: Tenant → Venue → Menu (carte) → Category → Item
 * Supports sous-cartes via parent_menu_id (self-referencing FK).
 *
 * Write helpers live in ./menu.mutations, shared types/interface in
 * ./menu.service.types. The menu reads are done where they are displayed
 * (audit B55: the 8 read helpers of this factory were never called).
 */

export type { MenuService } from './menu.service.types';

export function createMenuService(supabase: SupabaseClient): MenuService {
  return {
    createMenu: (tenantId, input: CreateMenuInput) => createMenu(supabase, tenantId, input),
    updateMenu: (tenantId, input: UpdateMenuInput) => updateMenu(supabase, tenantId, input),
    deleteMenu: (menuId, tenantId) => deleteMenu(supabase, menuId, tenantId),
    reorderMenus: (tenantId, orderedIds) => reorderMenus(supabase, tenantId, orderedIds),
  };
}
