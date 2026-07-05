import type { SupabaseClient } from '@supabase/supabase-js';
import type { Category, Menu, MenuItem } from '@/types/admin.types';
import { ServiceError } from './errors';
import { logger } from '@/lib/logger';
import type { CategoryWithItemRefs, MenuRow, MenuWithRelations } from './menu.service.types';

/**
 * Menu/Carte Service - read queries.
 *
 * Pure query helpers receiving the Supabase client by injection.
 * Every method that touches a multi-tenant table filters by tenant_id.
 */

/**
 * Get all menus for a tenant, grouped with children (sous-cartes).
 * Returns only top-level menus; children are nested via the join.
 */
export async function getMenusByTenant(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<MenuWithRelations[]> {
  const { data, error } = await supabase
    .from('menus')
    .select(
      'id, tenant_id, venue_id, parent_menu_id, name, name_en, slug, description, description_en, image_url, is_active, is_transversal_menu, display_order, created_at, updated_at, venue:venues(id, name, slug), children:menus!parent_menu_id(id, name, name_en, slug, is_active, display_order)',
    )
    .eq('tenant_id', tenantId)
    .is('parent_menu_id', null)
    .order('display_order', { ascending: true });

  if (error) {
    logger.error('Failed to fetch menus', { error: error.message });
    throw new ServiceError('Erreur lors du chargement des cartes', 'INTERNAL');
  }

  return (data as unknown as MenuWithRelations[]) || [];
}

/**
 * Get all menus for a tenant (flat list, including children).
 */
export async function getAllMenusFlat(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<MenuRow[]> {
  const { data, error } = await supabase
    .from('menus')
    .select(
      'id, tenant_id, venue_id, parent_menu_id, name, name_en, slug, description, description_en, image_url, is_active, is_transversal_menu, display_order, created_at, updated_at',
    )
    .eq('tenant_id', tenantId)
    .order('display_order', { ascending: true });

  if (error) {
    throw new ServiceError('Erreur lors du chargement des cartes', 'INTERNAL');
  }

  return (data as MenuRow[]) || [];
}

/**
 * Get transversal menus for a tenant (is_transversal_menu = TRUE, is_active).
 * These are exposed as sub-tabs across every other top-level menu.
 */
export async function getTransversalMenusByTenant(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<MenuRow[]> {
  const { data, error } = await supabase
    .from('menus')
    .select(
      'id, tenant_id, venue_id, parent_menu_id, name, name_en, slug, description, description_en, image_url, is_active, is_transversal_menu, display_order, created_at, updated_at',
    )
    .eq('tenant_id', tenantId)
    .eq('is_transversal_menu', true)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    logger.error('Failed to fetch transversal menus', { error: error.message });
    throw new ServiceError('Erreur lors du chargement des cartes transversales', 'INTERNAL');
  }

  return (data as MenuRow[]) || [];
}

/**
 * Get a single menu with its children, categories, and items.
 * Used for the menu detail admin page and client display.
 */
export async function getMenuWithChildren(
  supabase: SupabaseClient,
  tenantId: string,
  menuId: string,
): Promise<MenuWithRelations> {
  const { data, error } = await supabase
    .from('menus')
    .select(
      `
      id, tenant_id, venue_id, parent_menu_id, name, name_en, slug, description, description_en, image_url, is_active, is_transversal_menu, display_order, created_at, updated_at,
      venue:venues(id, name, slug),
      children:menus!parent_menu_id(
        id, name, name_en, slug, description, is_active, display_order
      )
    `,
    )
    .eq('id', menuId)
    .eq('tenant_id', tenantId)
    .single();

  if (error) {
    throw new ServiceError('Carte introuvable', 'NOT_FOUND');
  }

  return data as unknown as MenuWithRelations;
}

/**
 * Get a menu by its slug (for URL routing: ?menu=carte-boissons).
 */
export async function getMenuBySlug(
  supabase: SupabaseClient,
  tenantId: string,
  slug: string,
): Promise<MenuWithRelations | null> {
  const { data, error } = await supabase
    .from('menus')
    .select(
      'id, tenant_id, venue_id, parent_menu_id, name, name_en, slug, description, description_en, image_url, is_active, is_transversal_menu, display_order, created_at, updated_at, children:menus!parent_menu_id(id, name, name_en, slug, is_active, display_order)',
    )
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .single();

  if (error) {
    return null;
  }

  return data as unknown as MenuWithRelations;
}

/**
 * Get categories for a specific menu (scoped).
 */
export async function getCategoriesForMenu(
  supabase: SupabaseClient,
  tenantId: string,
  menuId: string,
): Promise<CategoryWithItemRefs[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*, menu_items:menu_items(id)')
    .eq('menu_id', menuId)
    .eq('tenant_id', tenantId)
    .order('display_order', { ascending: true });

  if (error) {
    throw new ServiceError('Erreur lors du chargement des catégories', 'INTERNAL');
  }

  return (data as CategoryWithItemRefs[]) || [];
}

/**
 * Get items for a specific menu (through its categories).
 */
export async function getItemsForMenu(
  supabase: SupabaseClient,
  tenantId: string,
  menuId: string,
): Promise<MenuItem[]> {
  // First get category IDs for this menu
  const { data: categories, error: catError } = await supabase
    .from('categories')
    .select('id')
    .eq('menu_id', menuId)
    .eq('tenant_id', tenantId);

  if (catError || !categories?.length) {
    return [];
  }

  const categoryIds = categories.map((c) => c.id);

  const { data: items, error: itemsError } = await supabase
    .from('menu_items')
    .select('*, category:categories(id, name, name_en)')
    .in('category_id', categoryIds)
    .eq('is_available', true)
    .order('created_at', { ascending: true });

  if (itemsError) {
    throw new ServiceError('Erreur lors du chargement des articles', 'INTERNAL');
  }

  return (items as unknown as MenuItem[]) || [];
}

/**
 * Load everything needed to render the admin MenuDetail page in a
 * single call: the menu with venue relation, its categories, the
 * unassigned categories (for the "add existing category" picker)
 * and the items belonging to its categories.
 */
export async function getMenuDetailBundle(
  supabase: SupabaseClient,
  tenantId: string,
  menuId: string,
): Promise<{
  menu: Menu;
  categories: Category[];
  availableCategories: Category[];
  items: MenuItem[];
}> {
  const menuRes = await supabase
    .from('menus')
    .select('*, venue:venues(id, name, slug)')
    .eq('id', menuId)
    .eq('tenant_id', tenantId)
    .single();
  if (menuRes.error) {
    throw new ServiceError('Erreur lors du chargement du menu', 'INTERNAL', menuRes.error);
  }

  const catsRes = await supabase
    .from('categories')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('menu_id', menuId)
    .order('display_order', { ascending: true });
  if (catsRes.error) {
    throw new ServiceError('Erreur lors du chargement des categories', 'INTERNAL', catsRes.error);
  }
  const categories = catsRes.data || [];

  const availRes = await supabase
    .from('categories')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('menu_id', null)
    .order('name', { ascending: true });
  if (availRes.error) {
    throw new ServiceError(
      'Erreur lors du chargement des categories disponibles',
      'INTERNAL',
      availRes.error,
    );
  }

  const catIds = categories.map((c: { id: string }) => c.id);
  let items: MenuItem[] = [];
  if (catIds.length > 0) {
    const itemsRes = await supabase
      .from('menu_items')
      .select('*, category:categories(id, name), modifiers:item_modifiers(*)')
      .eq('tenant_id', tenantId)
      .in('category_id', catIds)
      .order('created_at', { ascending: true });
    if (itemsRes.error) {
      throw new ServiceError('Erreur lors du chargement des articles', 'INTERNAL', itemsRes.error);
    }
    items = (itemsRes.data as unknown as MenuItem[]) || [];
  }

  return {
    menu: menuRes.data as unknown as Menu,
    categories: categories as Category[],
    availableCategories: (availRes.data as Category[]) || [],
    items,
  };
}
