import type { SupabaseClient } from '@supabase/supabase-js';
import type { Category, PreparationZone } from '@/types/admin.types';
import { ServiceError } from './errors';

// Mass-assignment allowlist: only these columns are ever written, so a forged
// server-action payload cannot set arbitrary category columns (mirrors the
// menu-item service). Keep in sync with Create/UpdateCategoryInput.
const ALLOWED_CATEGORY_COLUMNS = [
  'name',
  'name_en',
  'display_order',
  'preparation_zone',
  'is_featured_on_home',
  'is_active',
  'icon',
  'image_url',
  'tenant_id',
  'menu_id',
] as const;

function pickCategoryColumns(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_CATEGORY_COLUMNS) {
    if (key in data) out[key] = data[key];
  }
  return out;
}

interface CreateCategoryInput {
  name: string;
  name_en?: string | null;
  display_order?: number;
  preparation_zone?: PreparationZone;
  is_featured_on_home?: boolean;
  is_active?: boolean;
  icon?: string | null;
  image_url?: string | null;
  tenant_id: string;
  menu_id?: string | null;
}

interface UpdateCategoryInput {
  name: string;
  name_en?: string | null;
  display_order?: number;
  preparation_zone?: PreparationZone;
  is_featured_on_home?: boolean;
  is_active?: boolean;
  icon?: string | null;
  image_url?: string | null;
  tenant_id: string;
  menu_id?: string | null;
}

export interface CategoryService {
  createCategory(
    data: CreateCategoryInput,
    options?: { returning?: boolean },
  ): Promise<Category | null>;
  updateCategory(categoryId: string, data: UpdateCategoryInput): Promise<void>;
  deleteCategory(categoryId: string, tenantId: string): Promise<void>;
  assignCategoryToMenu(categoryId: string, menuId: string, tenantId: string): Promise<void>;
  reorderCategories(
    tenantId: string,
    updates: { id: string; display_order: number }[],
  ): Promise<void>;
  isCategoryLinkedToMenu(categoryId: string, tenantId: string): Promise<boolean>;
}

/**
 * Category service - handles category CRUD operations.
 *
 * Used by CategoriesClient, MenuDetailClient, and WizardStepCategories.
 */
export function createCategoryService(supabase: SupabaseClient): CategoryService {
  return {
    /**
     * Create a new category.
     * Returns the created category when `returning` is true.
     */
    async createCategory(
      data: CreateCategoryInput,
      options?: { returning?: boolean },
    ): Promise<Category | null> {
      const row = pickCategoryColumns(data as unknown as Record<string, unknown>);
      if (options?.returning) {
        const { data: category, error } = await supabase
          .from('categories')
          .insert([row])
          .select()
          .single();

        if (error) {
          throw new ServiceError('Erreur lors de la creation de la categorie', 'INTERNAL', error);
        }
        return category as Category;
      }

      const { error } = await supabase.from('categories').insert([row]);
      if (error) {
        throw new ServiceError('Erreur lors de la creation de la categorie', 'INTERNAL', error);
      }
      return null;
    },

    /**
     * Update an existing category.
     */
    async updateCategory(categoryId: string, data: UpdateCategoryInput): Promise<void> {
      // Double-scope the write: filter by id AND the tenant_id carried in the
      // validated payload (the caller sets data.tenant_id to the session tenant).
      // Belt-and-suspenders alongside RLS.
      const { error } = await supabase
        .from('categories')
        .update(pickCategoryColumns(data as unknown as Record<string, unknown>))
        .eq('id', categoryId)
        .eq('tenant_id', data.tenant_id);

      if (error) {
        throw new ServiceError('Erreur lors de la mise a jour de la categorie', 'INTERNAL', error);
      }
    },

    /**
     * Delete a category by ID, scoped to tenant.
     */
    async deleteCategory(categoryId: string, tenantId: string): Promise<void> {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', categoryId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new ServiceError('Erreur lors de la suppression de la categorie', 'INTERNAL', error);
      }
    },

    /**
     * Assign an existing category to a menu by updating its menu_id, scoped to tenant.
     */
    async assignCategoryToMenu(
      categoryId: string,
      menuId: string,
      tenantId: string,
    ): Promise<void> {
      const { error } = await supabase
        .from('categories')
        .update({ menu_id: menuId })
        .eq('id', categoryId)
        .eq('tenant_id', tenantId);

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
     * Returns true when the category is assigned to a menu (categories.menu_id).
     */
    async isCategoryLinkedToMenu(categoryId: string, tenantId: string): Promise<boolean> {
      const { data, error } = await supabase
        .from('categories')
        .select('menu_id')
        .eq('id', categoryId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) {
        throw new ServiceError(
          'Erreur lors de la verification du menu de la categorie',
          'INTERNAL',
          error,
        );
      }
      return data?.menu_id != null;
    },
  };
}
