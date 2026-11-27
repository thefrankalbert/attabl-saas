import type { SupabaseClient } from '@supabase/supabase-js';
import type { Category, PreparationZone } from '@/types/admin.types';
import { ServiceError } from './errors';
import { assertNameAvailable } from './duplicate-name';

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
  // Requis: le controle de doublon au renommage compare dans cette carte.
  menu_id: string | null;
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
      await assertNameAvailable(supabase, {
        table: 'categories',
        tenantId: data.tenant_id,
        name: data.name,
        message: 'Une catégorie porte déjà ce nom.',
        scope: { column: 'menu_id', value: data.menu_id },
      });
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
      // Audit B33: un renommage refuse le doublon comme la creation (meme
      // carte), sans compter la categorie elle-meme.
      await assertNameAvailable(supabase, {
        table: 'categories',
        tenantId: data.tenant_id,
        name: data.name,
        message: 'Une catégorie porte déjà ce nom.',
        scope: { column: 'menu_id', value: data.menu_id },
        excludeId: categoryId,
      });
      const { error, count } = await supabase
        .from('categories')
        .update(pickCategoryColumns(data as unknown as Record<string, unknown>), {
          count: 'exact',
        })
        .eq('id', categoryId)
        .eq('tenant_id', data.tenant_id);

      if (error) {
        throw new ServiceError('Erreur lors de la mise a jour de la categorie', 'INTERNAL', error);
      }
      // Un UPDATE qui ne touche rien ne rend aucune erreur: categorie supprimee
      // entre-temps, ou d'un autre restaurant.
      if (count === 0) throw new ServiceError('Categorie introuvable', 'NOT_FOUND');
    },

    /**
     * Delete a category by ID, scoped to tenant.
     */
    async deleteCategory(categoryId: string, tenantId: string): Promise<void> {
      // `count: 'exact'`: PostgREST ne leve AUCUNE erreur sur un DELETE qui ne
      // touche rien (identifiant d'un autre restaurant, deja supprime, ligne
      // masquee par RLS). Sans le compte, l'action annoncait un succes.
      const { error, count } = await supabase
        .from('categories')
        .delete({ count: 'exact' })
        .eq('id', categoryId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new ServiceError('Erreur lors de la suppression de la categorie', 'INTERNAL', error);
      }
      if (count === 0) {
        throw new ServiceError(
          "Cette categorie n'existe plus ou n'appartient pas a votre restaurant",
          'NOT_FOUND',
        );
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
     * Update the display_order of many categories in ONE atomic write.
     * Only the categories whose order actually changed need to be passed.
     *
     * Audit B32: une ecriture par ligne en parallele laissait un ordre a moitie
     * applique quand l'une echouait. La fonction SQL `reorder_categories` fait
     * un seul UPDATE filtre par tenant et l'annule si une ligne manque.
     */
    async reorderCategories(
      tenantId: string,
      updates: { id: string; display_order: number }[],
    ): Promise<void> {
      if (updates.length === 0) return;
      const { error } = await supabase.rpc('reorder_categories', {
        p_tenant_id: tenantId,
        p_updates: updates,
      });
      if (error) {
        if (error.code === 'P0002') {
          throw new ServiceError(
            'Une categorie a ete modifiee ou supprimee entre-temps. Rechargez la page.',
            'CONFLICT',
          );
        }
        throw new ServiceError(
          'Erreur lors du re-ordonnancement des categories',
          'INTERNAL',
          error,
        );
      }
    },
  };
}
