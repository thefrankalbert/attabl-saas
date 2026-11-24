import type { Menu } from '@/types/admin.types';
import type { CreateMenuInput, UpdateMenuInput } from '@/lib/validations/menu.schema';

/**
 * Menu/Carte Service - shared types.
 *
 * Manages the menu hierarchy: Tenant → Venue → Menu (carte) → Category → Item
 * Supports sous-cartes via parent_menu_id (self-referencing FK).
 */

/** All `menus` columns selected by the menu mutations (no joins). */
export type MenuRow = Omit<Menu, 'venue' | 'children' | 'categories'>;

export interface MenuService {
  createMenu(tenantId: string, input: CreateMenuInput): Promise<MenuRow>;
  updateMenu(tenantId: string, input: UpdateMenuInput): Promise<MenuRow>;
  deleteMenu(menuId: string, tenantId: string): Promise<void>;
  reorderMenus(tenantId: string, orderedIds: string[]): Promise<void>;
}
