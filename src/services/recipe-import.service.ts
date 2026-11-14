import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import { logger } from '@/lib/logger';
import type { ImportRowError } from '@/lib/excel-parse';
import type {
  IngredientUnit,
  RecipeImportResult,
  RecipeImportRpcRow,
} from '@/types/inventory.types';
import { convertQuantity } from './recipe-import/units';
import { parseRecipeSheet, type ParsedRecipeSheet } from './recipe-import/parser';
import { buildRecipeWorkbook, type RecipeTemplateData } from './recipe-import/template';

// --- Service ----------------------------------------------

export interface RecipeImportService {
  parseExcel(buffer: ArrayBuffer): Promise<ParsedRecipeSheet>;
  importFromExcel(tenantId: string, buffer: ArrayBuffer): Promise<RecipeImportResult>;
  generateTemplate(tenantId: string): Promise<Buffer>;
}

interface StoredIngredient {
  id: string;
  name: string;
  unit: IngredientUnit;
  is_active: boolean | null;
  created_at: string | null;
}

interface StoredRecipe {
  menu_item_id: string;
  ingredient_id: string;
  quantity_needed: number;
  notes: string | null;
}

/**
 * Recipe (fiche technique) Excel import service.
 *
 * Round trip: generateTemplate exports the tenant's dishes and recipe lines,
 * the restaurateur edits the file, importFromExcel reads it back.
 * - Dish names resolve to a tenant-scoped menu_item_id (unknown / ambiguous
 *   names are row errors, never a silent pick).
 * - The quantity is converted into the EXISTING ingredient's unit (g -> kg,
 *   cl -> L); a unit of another nature is a row error. Before, the unit column
 *   was ignored for an existing ingredient: 50 "g" was stored as 50 kg.
 * - Lines identical to the stored recipe are not rewritten (re-importing an
 *   untouched export changes nothing).
 * - Quantity 0 removes the line. Deleting a row in Excel removes nothing.
 * Upserts go through the all-or-nothing import_recipes_tx RPC.
 */
export function createRecipeImportService(supabase: SupabaseClient): RecipeImportService {
  return {
    parseExcel(buffer: ArrayBuffer): Promise<ParsedRecipeSheet> {
      return parseRecipeSheet(buffer);
    },

    async importFromExcel(tenantId: string, buffer: ArrayBuffer): Promise<RecipeImportResult> {
      logger.info('Starting Excel recipe import', { tenantId });

      const { rows, removals, errors: parseErrors } = await this.parseExcel(buffer);
      const errors: ImportRowError[] = [...parseErrors];
      let recipesUnchanged = 0;

      const result = (
        counts: { created?: number; updated?: number; ingredients?: number; removed?: number } = {},
      ): RecipeImportResult => ({
        recipesCreated: counts.created ?? 0,
        recipesUpdated: counts.updated ?? 0,
        recipesRemoved: counts.removed ?? 0,
        recipesUnchanged,
        ingredientsCreated: counts.ingredients ?? 0,
        itemsSkipped: errors.length,
        errors,
      });

      if (rows.length === 0 && removals.length === 0) return result();

      // Tenant-scoped reference data, loaded once.
      const [menuRes, ingRes, recipeRes] = await Promise.all([
        supabase
          .from('menu_items')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null),
        supabase
          .from('ingredients')
          .select('id, name, unit, is_active, created_at')
          .eq('tenant_id', tenantId),
        supabase
          .from('recipes')
          .select('menu_item_id, ingredient_id, quantity_needed, notes')
          .eq('tenant_id', tenantId),
      ]);
      if (menuRes.error) {
        throw new ServiceError('Erreur chargement des plats', 'INTERNAL', menuRes.error);
      }
      if (ingRes.error) {
        throw new ServiceError('Erreur chargement des ingredients', 'INTERNAL', ingRes.error);
      }
      if (recipeRes.error) {
        throw new ServiceError('Erreur chargement des fiches', 'INTERNAL', recipeRes.error);
      }

      const idsByLowerName = new Map<string, string[]>();
      for (const m of (menuRes.data as { id: string; name: string }[]) ?? []) {
        const key = m.name.toLowerCase();
        const list = idsByLowerName.get(key);
        if (list) list.push(m.id);
        else idsByLowerName.set(key, [m.id]);
      }

      // Same pick as import_recipes_tx: active first, then the oldest.
      const ingredientByLowerName = new Map<string, StoredIngredient>();
      const sortedIngredients = [...((ingRes.data as StoredIngredient[]) ?? [])].sort(
        (a, b) =>
          Number(Boolean(b.is_active)) - Number(Boolean(a.is_active)) ||
          String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')),
      );
      for (const ing of sortedIngredients) {
        const key = ing.name.toLowerCase();
        if (!ingredientByLowerName.has(key)) ingredientByLowerName.set(key, ing);
      }

      const storedRecipe = new Map<string, StoredRecipe>();
      for (const r of (recipeRes.data as StoredRecipe[]) ?? []) {
        storedRecipe.set(`${r.menu_item_id}|${r.ingredient_id}`, r);
      }

      const resolveDish = (rowNumber: number, dishName: string): string | null => {
        const ids = idsByLowerName.get(dishName.toLowerCase());
        if (!ids || ids.length === 0) {
          errors.push({ row: rowNumber, message: `Plat introuvable : ${dishName}` });
          return null;
        }
        if (ids.length > 1) {
          errors.push({
            row: rowNumber,
            message: `Plat ambigu (plusieurs plats nommes "${dishName}")`,
          });
          return null;
        }
        return ids[0];
      };

      // A NEW ingredient takes the unit of its first line; later lines convert to it.
      const newIngredientUnit = new Map<string, IngredientUnit>();
      const cleanRows: RecipeImportRpcRow[] = [];
      for (const row of rows) {
        const menuItemId = resolveDish(row.rowNumber, row.dishName);
        if (!menuItemId) continue;

        const key = row.ingredientName.toLowerCase();
        const existing = ingredientByLowerName.get(key);
        const targetUnit = existing?.unit ?? newIngredientUnit.get(key) ?? row.unit;
        if (!existing && !newIngredientUnit.has(key)) newIngredientUnit.set(key, row.unit);

        const quantity = convertQuantity(row.quantityNeeded, row.unit, targetUnit);
        if (quantity === null) {
          errors.push({
            row: row.rowNumber,
            message: `Unité incompatible pour "${row.ingredientName}" : l'ingrédient est suivi en ${targetUnit}, le fichier indique ${row.unit}`,
          });
          continue;
        }

        if (existing) {
          const stored = storedRecipe.get(`${menuItemId}|${existing.id}`);
          if (
            stored &&
            Math.abs(Number(stored.quantity_needed) - quantity) < 1e-9 &&
            (stored.notes || null) === row.notes
          ) {
            recipesUnchanged++;
            continue;
          }
        }

        cleanRows.push({
          menu_item_id: menuItemId,
          ingredient_name: row.ingredientName,
          unit: targetUnit,
          quantity_needed: quantity,
          notes: row.notes,
        });
      }

      // Removals resolved before any write: an unknown dish is a row error; an
      // ingredient that is not on the dish has nothing to remove.
      const toRemove: Array<{ menuItemId: string; ingredientId: string }> = [];
      for (const removal of removals) {
        const menuItemId = resolveDish(removal.rowNumber, removal.dishName);
        if (!menuItemId) continue;
        const ing = ingredientByLowerName.get(removal.ingredientName.toLowerCase());
        if (ing && storedRecipe.has(`${menuItemId}|${ing.id}`)) {
          toRemove.push({ menuItemId, ingredientId: ing.id });
        }
      }

      let counts: {
        recipes_created?: number;
        recipes_updated?: number;
        ingredients_created?: number;
      } = {};
      if (cleanRows.length > 0) {
        // All-or-nothing on the clean set: only ever receives pre-validated rows.
        const { data, error } = await supabase.rpc('import_recipes_tx', {
          p_tenant_id: tenantId,
          p_rows: cleanRows,
        });

        if (error) {
          const message = error.message ?? '';
          if (message.includes('MENU_ITEM_NOT_FOUND')) {
            throw new ServiceError('Plat introuvable pour ce restaurant', 'NOT_FOUND', error);
          }
          if (
            message.includes('INVALID_UNIT') ||
            message.includes('INVALID_QUANTITY') ||
            message.includes('INVALID_INGREDIENT_NAME')
          ) {
            throw new ServiceError('Donnees de fiche technique invalides', 'VALIDATION', error);
          }
          throw new ServiceError(
            "Erreur lors de l'import des fiches techniques",
            'INTERNAL',
            error,
          );
        }
        counts = (data ?? {}) as typeof counts;
      }

      let removed = 0;
      for (const target of toRemove) {
        // count: 'exact' - PostgREST reports no error on a DELETE that matched nothing.
        const { error, count } = await supabase
          .from('recipes')
          .delete({ count: 'exact' })
          .eq('tenant_id', tenantId)
          .eq('menu_item_id', target.menuItemId)
          .eq('ingredient_id', target.ingredientId);
        if (error) {
          throw new ServiceError('Erreur lors du retrait d un ingredient', 'INTERNAL', error);
        }
        removed += count ?? 0;
      }

      return result({
        created: counts.recipes_created,
        updated: counts.recipes_updated,
        ingredients: counts.ingredients_created,
        removed,
      });
    },

    async generateTemplate(tenantId: string): Promise<Buffer> {
      const [catRes, itemRes, recipeRes, ingRes] = await Promise.all([
        supabase.from('categories').select('id, name, display_order').eq('tenant_id', tenantId),
        supabase
          .from('menu_items')
          .select('id, name, category_id')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null),
        supabase
          .from('recipes')
          .select('menu_item_id, quantity_needed, notes, ingredient:ingredients(name, unit)')
          .eq('tenant_id', tenantId),
        supabase.from('ingredients').select('name').eq('tenant_id', tenantId).eq('is_active', true),
      ]);
      const failed = catRes.error ?? itemRes.error ?? recipeRes.error ?? ingRes.error;
      if (failed) {
        throw new ServiceError('Erreur chargement des fiches techniques', 'INTERNAL', failed);
      }

      return buildRecipeWorkbook({
        categories: (catRes.data as RecipeTemplateData['categories']) ?? [],
        menuItems: (itemRes.data as RecipeTemplateData['menuItems']) ?? [],
        recipes: (recipeRes.data as unknown as RecipeTemplateData['recipes']) ?? [],
        ingredientNames: ((ingRes.data as { name: string }[]) ?? []).map((i) => i.name),
      });
    },
  };
}
