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

    /**
     * Update the display_order of many categories in a single batch.
     * Only the categories whose order actually changed need to be passed.
     */
    async reorderCategories(
      tenantId: string,
      updates: { id: string; display_order: number }[],
    ): Promise<void> {
      const promises = updates.map(({ id, display_order }) =>
        supabase
          .from('categories')
          .update({ display_order })
          .eq('id', id)
          .eq('tenant_id', tenantId),
      );
      const results = await Promise.all(promises);
      const error = results.find((r) => r.error)?.error;
      if (error) {
        throw new ServiceError(
          'Erreur lors du re-ordonnancement des categories',
          'INTERNAL',
          error,
        );
      }
    },

    /**
     * Returns true if the category is linked to at least one menu via
     * the menu_categories pivot table.
     */
    async isCategoryLinkedToMenu(categoryId: string): Promise<boolean> {
      const { data, error } = await supabase
        .from('menu_categories')
        .select('id')
        .eq('category_id', categoryId)
        .limit(1);

      if (error) {
        throw new ServiceError(
          'Erreur lors de la verification du menu de la categorie',
          'INTERNAL',
          error,
        );
      }
      return (data || []).length > 0;
    },
  };
}
