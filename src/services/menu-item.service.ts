import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteMenuItemScoped, updateMenuItemScoped } from '@/lib/menu-items-query';
import { ServiceError } from './errors';
import { assertNameAvailable } from './duplicate-name';

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
  'images',
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

const ITEM_NOT_FOUND = 'Plat introuvable (supprime entre-temps ?)';

/**
 * Audit B56: un UPDATE qui ne touche aucune ligne ne rend aucune erreur. Sans
 * ce controle, modifier un plat supprime entre-temps affichait "Plat
 * enregistre" alors que rien n'avait ete ecrit.
 */
function assertTouched(result: { error: unknown | null; count: number | null }, message: string) {
  if (result.error) throw new ServiceError(message, 'INTERNAL', result.error);
  if (result.count === 0) throw new ServiceError(ITEM_NOT_FOUND, 'NOT_FOUND');
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
      await assertNameAvailable(supabase, {
        table: 'menu_items',
        tenantId,
        name: typeof payload.name === 'string' ? payload.name : '',
        message: 'Un plat porte déjà ce nom dans cette catégorie.',
        scope: {
          column: 'category_id',
          value: typeof payload.category_id === 'string' ? payload.category_id : null,
        },
        excludeSoftDeleted: true,
      });
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
      if (typeof payload.name === 'string') {
        // Audit B33: un renommage refuse le doublon comme la creation. La
        // categorie de comparaison est celle envoyee, sinon celle du plat.
        let categoryId = typeof payload.category_id === 'string' ? payload.category_id : null;
        if (!categoryId) {
          const { data: current, error: readError } = await supabase
            .from('menu_items')
            .select('category_id')
            .eq('id', itemId)
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)
            .maybeSingle();
          if (readError) {
            throw new ServiceError('Erreur lors de la mise a jour du plat', 'INTERNAL', readError);
          }
          if (!current) throw new ServiceError(ITEM_NOT_FOUND, 'NOT_FOUND');
          categoryId = (current as { category_id: string | null }).category_id;
        }
        await assertNameAvailable(supabase, {
          table: 'menu_items',
          tenantId,
          name: payload.name,
          message: 'Un plat porte déjà ce nom dans cette catégorie.',
          scope: { column: 'category_id', value: categoryId },
          excludeSoftDeleted: true,
          excludeId: itemId,
        });
      }
      assertTouched(
        await updateMenuItemScoped(supabase, itemId, tenantId, pickMenuItemColumns(payload)),
        'Erreur lors de la mise a jour du plat',
      );
    },

    /**
     * Soft-delete a menu item (preserves order_items history).
     */
    async deleteMenuItem(itemId: string, tenantId: string): Promise<void> {
      assertTouched(
        await deleteMenuItemScoped(supabase, itemId, tenantId),
        'Erreur lors de la suppression du plat',
      );
    },

    /**
     * Toggle the is_available flag on a menu item.
     */
    async toggleAvailable(itemId: string, isAvailable: boolean, tenantId: string): Promise<void> {
      assertTouched(
        await updateMenuItemScoped(supabase, itemId, tenantId, {
          is_available: isAvailable,
        }),
        'Erreur lors du changement de disponibilite',
      );
    },

    /**
     * Toggle the is_featured flag on a menu item.
     */
    async toggleFeatured(itemId: string, isFeatured: boolean, tenantId: string): Promise<void> {
      assertTouched(
        await updateMenuItemScoped(supabase, itemId, tenantId, {
          is_featured: isFeatured,
        }),
        'Erreur lors du changement de mise en avant',
      );
    },

    /**
     * Update the price of a menu item.
     */
    async updatePrice(itemId: string, price: number, tenantId: string): Promise<void> {
      assertTouched(
        await updateMenuItemScoped(supabase, itemId, tenantId, { price }),
        'Erreur lors de la mise a jour du prix',
      );
    },
  };
}
