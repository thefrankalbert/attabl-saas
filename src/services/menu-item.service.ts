import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';

/**
 * Menu item service - handles menu item CRUD operations.
 *
 * Used by ItemsClient and MenuDetailClient.
 */
export function createMenuItemService(supabase: SupabaseClient) {
  return {
    /**
     * Create a new menu item.
     */
    async createMenuItem(payload: Record<string, unknown>): Promise<void> {
      const { error } = await supabase.from('menu_items').insert([payload]);

      if (error) {
        throw new ServiceError('Erreur lors de la creation du plat', 'INTERNAL', error);
      }
    },

    /**
     * Update an existing menu item.
     */
    async updateMenuItem(
      itemId: string,
      tenantId: string,
      payload: Record<string, unknown>,
    ): Promise<void> {
      const { error } = await supabase
        .from('menu_items')
        .update(payload)
        .eq('id', itemId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new ServiceError('Erreur lors de la mise a jour du plat', 'INTERNAL', error);
      }
    },

    /**
     * Delete a menu item by ID.
     */
    async deleteMenuItem(itemId: string, tenantId: string): Promise<void> {
      const { error } = await supabase
        .from('menu_items')
        .delete()
        .eq('id', itemId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new ServiceError('Erreur lors de la suppression du plat', 'INTERNAL', error);
      }
    },

    /**
     * Toggle the is_available flag on a menu item.
     */
    async toggleAvailable(itemId: string, isAvailable: boolean, tenantId: string): Promise<void> {
      const { error } = await supabase
        .from('menu_items')
        .update({ is_available: isAvailable })
        .eq('id', itemId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new ServiceError('Erreur lors du changement de disponibilite', 'INTERNAL', error);
      }
    },

    /**
     * Toggle the is_featured flag on a menu item.
     */
    async toggleFeatured(itemId: string, isFeatured: boolean, tenantId: string): Promise<void> {
      const { error } = await supabase
        .from('menu_items')
        .update({ is_featured: isFeatured })
        .eq('id', itemId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new ServiceError('Erreur lors du changement de mise en avant', 'INTERNAL', error);
      }
    },

    /**
     * Update the price of a menu item.
     */
    async updatePrice(itemId: string, price: number, tenantId: string): Promise<void> {
      const { error } = await supabase
        .from('menu_items')
        .update({ price })
        .eq('id', itemId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new ServiceError('Erreur lors de la mise a jour du prix', 'INTERNAL', error);
      }
    },
  };
}
