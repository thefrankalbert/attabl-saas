import type { SupabaseClient } from '@supabase/supabase-js';
import type { PreparationZone } from '@/types/admin.types';
import { ServiceError } from './errors';

interface CreateCategoryInput {
  name: string;
  name_en?: string | null;
  display_order?: number;
  preparation_zone?: PreparationZone;
  is_featured_on_home?: boolean;
  tenant_id: string;
  menu_id?: string | null;
}

interface UpdateCategoryInput {
  name: string;
  name_en?: string | null;
  display_order?: number;
  preparation_zone?: PreparationZone;
  is_featured_on_home?: boolean;
  tenant_id: string;
  menu_id?: string | null;
}

/**
 * Category service - handles category CRUD operations.
 *
 * Used by CategoriesClient, MenuDetailClient, and WizardStepCategories.
 */
export function createCategoryService(supabase: SupabaseClient) {
  return {
    /**
     * Create a new category.
     * Returns the created category when `returning` is true.
     */
    async createCategory(
      data: CreateCategoryInput,
      options?: { returning?: boolean },
    ): Promise<unknown> {
      if (options?.returning) {
        const { data: category, error } = await supabase
          .from('categories')
          .insert([data])
          .select()
          .single();

        if (error) {
          throw new ServiceError('Erreur lors de la creation de la categorie', 'INTERNAL', error);
        }
        return category;
      }

      const { error } = await supabase.from('categories').insert([data]);
      if (error) {
        throw new ServiceError('Erreur lors de la creation de la categorie', 'INTERNAL', error);
      }
      return null;
    },

    /**
     * Update an existing category.
     */
    async updateCategory(categoryId: string, data: UpdateCategoryInput): Promise<void> {
      const { error } = await supabase.from('categories').update(data).eq('id', categoryId);

      if (error) {
        throw new ServiceError('Erreur lors de la mise a jour de la categorie', 'INTERNAL', error);
      }
    },

    /**
     * Delete a category by ID.
     */
    async deleteCategory(categoryId: string): Promise<void> {
      const { error } = await supabase.from('categories').delete().eq('id', categoryId);

      if (error) {
        throw new ServiceError('Erreur lors de la suppression de la categorie', 'INTERNAL', error);
      }
    },

    /**
     * Assign an existing category to a menu by updating its menu_id.
     */
    async assignCategoryToMenu(categoryId: string, menuId: string): Promise<void> {
      const { error } = await supabase
        .from('categories')
        .update({ menu_id: menuId })
        .eq('id', categoryId);

      if (error) {
        throw new ServiceError("Erreur lors de l'assignation de la categorie", 'INTERNAL', error);
      }
    },
  };
}
