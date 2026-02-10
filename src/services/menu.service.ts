import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreateMenuInput, UpdateMenuInput } from '@/lib/validations/menu.schema';
import { ServiceError } from './errors';
import { logger } from '@/lib/logger';

/**
 * Menu/Carte Service — factory pattern.
 *
 * Manages the menu hierarchy: Tenant → Venue → Menu (carte) → Category → Item
 * Supports sous-cartes via parent_menu_id (self-referencing FK).
 */
export function createMenuService(supabase: SupabaseClient) {
  return {
    /**
     * Get all menus for a tenant, grouped with children (sous-cartes).
     * Returns only top-level menus; children are nested via the join.
     */
    async getMenusByTenant(tenantId: string) {
      const { data, error } = await supabase
        .from('menus')
        .select(
          '*, venue:venues(id, name, slug), children:menus!parent_menu_id(id, name, name_en, slug, is_active, display_order)',
        )
        .eq('tenant_id', tenantId)
        .is('parent_menu_id', null)
        .order('display_order', { ascending: true });

      if (error) {
        logger.error('Failed to fetch menus', { error: error.message });
        throw new ServiceError('Erreur lors du chargement des cartes', 'INTERNAL');
      }

      return data || [];
    },

    /**
     * Get all menus for a tenant (flat list, including children).
     */
    async getAllMenusFlat(tenantId: string) {
      const { data, error } = await supabase
        .from('menus')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('display_order', { ascending: true });

      if (error) {
        throw new ServiceError('Erreur lors du chargement des cartes', 'INTERNAL');
      }

      return data || [];
    },

    /**
     * Get a single menu with its children, categories, and items.
     * Used for the menu detail admin page and client display.
     */
    async getMenuWithChildren(menuId: string) {
      const { data, error } = await supabase
        .from('menus')
        .select(
          `
          *,
          venue:venues(id, name, slug),
          children:menus!parent_menu_id(
            id, name, name_en, slug, description, is_active, display_order
          )
        `,
        )
        .eq('id', menuId)
        .single();

      if (error) {
        throw new ServiceError('Carte introuvable', 'NOT_FOUND');
      }

      return data;
    },

    /**
     * Get a menu by its slug (for URL routing: ?menu=carte-boissons).
     */
    async getMenuBySlug(tenantId: string, slug: string) {
      const { data, error } = await supabase
        .from('menus')
        .select(
          '*, children:menus!parent_menu_id(id, name, name_en, slug, is_active, display_order)',
        )
        .eq('tenant_id', tenantId)
        .eq('slug', slug)
        .single();

      if (error) {
        return null;
      }

      return data;
    },

    /**
     * Create a new menu (carte).
     * Generates a unique slug from the name.
     */
    async createMenu(tenantId: string, input: CreateMenuInput) {
      // Generate slug via RPC
      const { data: slugData, error: slugError } = await supabase.rpc('generate_menu_slug', {
        p_tenant_id: tenantId,
        p_name: input.name,
      });

      if (slugError) {
        logger.error('Failed to generate menu slug', { error: slugError.message });
        // Fallback: generate slug client-side
        const fallbackSlug =
          input.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || 'carte';

        const { data, error } = await supabase
          .from('menus')
          .insert({
            tenant_id: tenantId,
            name: input.name,
            name_en: input.name_en || null,
            slug: fallbackSlug + '-' + Date.now(),
            description: input.description || null,
            description_en: input.description_en || null,
            venue_id: input.venue_id || null,
            parent_menu_id: input.parent_menu_id || null,
            image_url: input.image_url || null,
            is_active: input.is_active ?? true,
            display_order: input.display_order ?? 0,
          })
          .select()
          .single();

        if (error) {
          throw new ServiceError('Erreur lors de la création de la carte', 'INTERNAL');
        }
        return data;
      }

      const slug = slugData as string;

      const { data, error } = await supabase
        .from('menus')
        .insert({
          tenant_id: tenantId,
          name: input.name,
          name_en: input.name_en || null,
          slug,
          description: input.description || null,
          description_en: input.description_en || null,
          venue_id: input.venue_id || null,
          parent_menu_id: input.parent_menu_id || null,
          image_url: input.image_url || null,
          is_active: input.is_active ?? true,
          display_order: input.display_order ?? 0,
        })
        .select()
        .single();

      if (error) {
        logger.error('Failed to create menu', { error: error.message });
        throw new ServiceError('Erreur lors de la création de la carte', 'INTERNAL');
      }

      return data;
    },

    /**
     * Update an existing menu.
     */
    async updateMenu(input: UpdateMenuInput) {
      const { id, ...updates } = input;

      // If name changed, regenerate slug
      let slug: string | undefined;
      if (updates.name) {
        // Get tenant_id from existing menu
        const { data: existing } = await supabase
          .from('menus')
          .select('tenant_id')
          .eq('id', id)
          .single();

        if (existing) {
          const { data: slugData } = await supabase.rpc('generate_menu_slug', {
            p_tenant_id: existing.tenant_id,
            p_name: updates.name,
          });
          if (slugData) {
            slug = slugData as string;
          }
        }
      }

      const payload: Record<string, unknown> = {};
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.name_en !== undefined) payload.name_en = updates.name_en;
      if (slug) payload.slug = slug;
      if (updates.description !== undefined) payload.description = updates.description;
      if (updates.description_en !== undefined) payload.description_en = updates.description_en;
      if (updates.venue_id !== undefined) payload.venue_id = updates.venue_id || null;
      if (updates.parent_menu_id !== undefined)
        payload.parent_menu_id = updates.parent_menu_id || null;
      if (updates.image_url !== undefined) payload.image_url = updates.image_url || null;
      if (updates.is_active !== undefined) payload.is_active = updates.is_active;
      if (updates.display_order !== undefined) payload.display_order = updates.display_order;

      const { data, error } = await supabase
        .from('menus')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('Failed to update menu', { error: error.message });
        throw new ServiceError('Erreur lors de la mise à jour de la carte', 'INTERNAL');
      }

      return data;
    },

    /**
     * Delete a menu. Categories cascade-delete via FK.
     */
    async deleteMenu(menuId: string) {
      const { error } = await supabase.from('menus').delete().eq('id', menuId);

      if (error) {
        logger.error('Failed to delete menu', { error: error.message });
        throw new ServiceError('Erreur lors de la suppression de la carte', 'INTERNAL');
      }
    },

    /**
     * Reorder menus by updating display_order.
     */
    async reorderMenus(tenantId: string, orderedIds: string[]) {
      const updates = orderedIds.map((id, index) =>
        supabase
          .from('menus')
          .update({ display_order: index })
          .eq('id', id)
          .eq('tenant_id', tenantId),
      );

      const results = await Promise.all(updates);
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        throw new ServiceError('Erreur lors du réordonnancement', 'INTERNAL');
      }
    },

    /**
     * Get categories for a specific menu (scoped).
     */
    async getCategoriesForMenu(menuId: string) {
      const { data, error } = await supabase
        .from('categories')
        .select('*, menu_items:menu_items(id)')
        .eq('menu_id', menuId)
        .order('display_order', { ascending: true });

      if (error) {
        throw new ServiceError('Erreur lors du chargement des catégories', 'INTERNAL');
      }

      return data || [];
    },

    /**
     * Get items for a specific menu (through its categories).
     */
    async getItemsForMenu(menuId: string) {
      // First get category IDs for this menu
      const { data: categories, error: catError } = await supabase
        .from('categories')
        .select('id')
        .eq('menu_id', menuId);

      if (catError || !categories?.length) {
        return [];
      }

      const categoryIds = categories.map((c) => c.id);

      const { data: items, error: itemsError } = await supabase
        .from('menu_items')
        .select('*, category:categories(id, name, name_en)')
        .in('category_id', categoryIds)
        .eq('is_available', true)
        .order('display_order', { ascending: true });

      if (itemsError) {
        throw new ServiceError('Erreur lors du chargement des articles', 'INTERNAL');
      }

      return items || [];
    },
  };
}
