import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteMenuItemScoped, updateMenuItemScoped } from '@/lib/menu-items-query';
import { ServiceError } from './errors';

/**
 * Columns a client is allowed to write on menu_items. Anything else in the
 * payload (id, tenant_id, rating/rating_count, joined relations, timestamps)
 * is dropped to prevent mass-assignment - the payload arrives as an untyped
 * Record from the client, so we never spread it raw into the DB.
 */
const ALLOWED_MENU_ITEM_COLUMNS = [
  'name',
  'name_en',
  'description',
  'description_en',
  'price',
  'prices',
  'image_url',
  'image_back_url',
  'is_available',
  'is_featured',
  'is_vegetarian',
  'is_spicy',
  'is_drink',
  'allergens',
  'calories',
  'category_id',
  'display_order',
] as const;

function pickMenuItemColumns(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_MENU_ITEM_COLUMNS) {
    if (key in payload) out[key] = payload[key];
  }
  return out;
}

export interface MenuItemService {
  createMenuItem(tenantId: string, payload: Record<string, unknown>): Promise<string>;
  updateMenuItem(itemId: string, tenantId: string, payload: Record<string, unknown>): Promise<void>;
  deleteMenuItem(itemId: string, tenantId: string): Promise<void>;
  toggleAvailable(itemId: string, isAvailable: boolean, tenantId: string): Promise<void>;
  toggleFeatured(itemId: string, isFeatured: boolean, tenantId: string): Promise<void>;
  updatePrice(itemId: string, price: number, tenantId: string): Promise<void>;
}

/**
 * Menu item service - handles menu item CRUD operations.
 *
 * Used by ItemsClient and MenuDetailClient.
 */
export function createMenuItemService(supabase: SupabaseClient): MenuItemService {
  return {
    /**
     * Create a new menu item.
     */
    async createMenuItem(tenantId: string, payload: Record<string, unknown>): Promise<string> {
      if (!tenantId) throw new ServiceError('tenant_id manquant', 'VALIDATION');
      const { data, error } = await supabase
        .from('menu_items')
        .insert([{ ...pickMenuItemColumns(payload), tenant_id: tenantId }])
        .select('id')
        .single();

      if (error) {
        throw new ServiceError('Erreur lors de la creation du plat', 'INTERNAL', error);
      }
      if (!data?.id) {
        throw new ServiceError('Plat non cree (RLS ou contrainte DB)', 'INTERNAL');
      }
      return data.id as string;
    },

    /**
     * Update an existing menu item.
     */
    async updateMenuItem(
      itemId: string,
      tenantId: string,
      payload: Record<string, unknown>,
    ): Promise<void> {
      const { error } = await updateMenuItemScoped(
        supabase,
        itemId,
        tenantId,
        pickMenuItemColumns(payload),
      );

      if (error) {
        throw new ServiceError('Erreur lors de la mise a jour du plat', 'INTERNAL', error);
      }
    },

    /**
     * Soft-delete a menu item (preserves order_items history).
     */
    async deleteMenuItem(itemId: string, tenantId: string): Promise<void> {
      const { error } = await deleteMenuItemScoped(supabase, itemId, tenantId);

      if (error) {
        throw new ServiceError('Erreur lors de la suppression du plat', 'INTERNAL', error);
      }
    },

    /**
     * Toggle the is_available flag on a menu item.
     */
    async toggleAvailable(itemId: string, isAvailable: boolean, tenantId: string): Promise<void> {
      const { error } = await updateMenuItemScoped(supabase, itemId, tenantId, {
        is_available: isAvailable,
      });

      if (error) {
        throw new ServiceError('Erreur lors du changement de disponibilite', 'INTERNAL', error);
      }
    },

    /**
     * Toggle the is_featured flag on a menu item.
     */
    async toggleFeatured(itemId: string, isFeatured: boolean, tenantId: string): Promise<void> {
      const { error } = await updateMenuItemScoped(supabase, itemId, tenantId, {
        is_featured: isFeatured,
      });

      if (error) {
        throw new ServiceError('Erreur lors du changement de mise en avant', 'INTERNAL', error);
      }
    },

    /**
     * Update the price of a menu item.
     */
    async updatePrice(itemId: string, price: number, tenantId: string): Promise<void> {
      const { error } = await updateMenuItemScoped(supabase, itemId, tenantId, { price });

      if (error) {
        throw new ServiceError('Erreur lors de la mise a jour du prix', 'INTERNAL', error);
      }
    },
  };
}
