import type { Category, Menu, MenuItem } from '@/types/admin.types';
import type { CreateMenuInput, UpdateMenuInput } from '@/lib/validations/menu.schema';

/**
 * Menu/Carte Service - shared types.
 *
 * Manages the menu hierarchy: Tenant → Venue → Menu (carte) → Category → Item
 * Supports sous-cartes via parent_menu_id (self-referencing FK).
 */

/** All `menus` columns selected by the menu queries (no joins). */
export type MenuRow = Omit<Menu, 'venue' | 'children' | 'categories'>;

/** Partial venue projection embedded in some menu queries (id, name, slug only). */
export interface MenuVenueRef {
  id: string;
  name: string;
  slug: string;
}

/** Partial child-menu projection embedded via the self-referencing FK. */
export interface MenuChildRef {
  id: string;
  name: string;
  name_en?: string;
  slug: string;
  description?: string;
  is_active: boolean;
  display_order: number;
}

/** Top-level menu with its embedded venue ref and child refs. */
export type MenuWithRelations = MenuRow & {
  venue?: MenuVenueRef | null;
  children?: MenuChildRef[];
};

/** Category row plus the lightweight item-count join used by the admin nav. */
export type CategoryWithItemRefs = Category & { menu_items: { id: string }[] };

export interface MenuService {
  getMenusByTenant(tenantId: string): Promise<MenuWithRelations[]>;
  getAllMenusFlat(tenantId: string): Promise<MenuRow[]>;
  getTransversalMenusByTenant(tenantId: string): Promise<MenuRow[]>;
  getMenuWithChildren(tenantId: string, menuId: string): Promise<MenuWithRelations>;
  getMenuBySlug(tenantId: string, slug: string): Promise<MenuWithRelations | null>;
  createMenu(tenantId: string, input: CreateMenuInput): Promise<MenuRow>;
  updateMenu(tenantId: string, input: UpdateMenuInput): Promise<MenuRow>;
  deleteMenu(menuId: string, tenantId: string): Promise<void>;
  reorderMenus(tenantId: string, orderedIds: string[]): Promise<void>;
  getCategoriesForMenu(tenantId: string, menuId: string): Promise<CategoryWithItemRefs[]>;
  getItemsForMenu(tenantId: string, menuId: string): Promise<MenuItem[]>;
  getMenuDetailBundle(
    tenantId: string,
    menuId: string,
  ): Promise<{
    menu: Menu;
    categories: Category[];
    availableCategories: Category[];
    items: MenuItem[];
  }>;
}
