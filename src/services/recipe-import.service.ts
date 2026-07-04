import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ServiceError } from './errors';
import { logger } from '@/lib/logger';
import {
  normalizeHeader,
  mapHeaders,
  parseNumericCell,
  readFirstSheetRows,
  isEmptyRow,
  type ImportRowError,
} from '@/lib/excel-parse';
import type {
  IngredientUnit,
  ParsedRecipeRow,
  RecipeImportResult,
  RecipeImportRpcRow,
} from '@/types/inventory.types';

// --- Column aliases (tolerant FR / EN) --------------------

const RECIPE_ALIASES: Record<string, string[]> = {
  dishName: [
    'dish',
    'dishname',
    'plat',
    'nomduplat',
    'nomplat',
    'recette',
    'menuitem',
    'article',
    'item',
  ],
  ingredientName: [
    'ingredient',
    'ingredientname',
    'nomingredient',
    'produit',
    'matiere',
    'matierepremiere',
  ],
  unit: ['unit', 'unite', 'unitmesure', 'unitedemesure', 'mesure'],
  quantity: [
    'quantity',
    'quantite',
    'qty',
    'qte',
    'quantityneeded',
    'quantitenecessaire',
    'besoin',
  ],
  notes: ['notes', 'note', 'remarque', 'remarques', 'commentaire', 'commentaires'],
};

// Map a normalized unit label to the DB enum value. The 'pièce' target keeps the
// accented literal used by the ingredients.unit CHECK (data, not punctuation).
const UNIT_ALIASES: Record<string, IngredientUnit> = {
  kg: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogramme: 'kg',
  kilogrammes: 'kg',
  g: 'g',
  gr: 'g',
  gramme: 'g',
  grammes: 'g',
  l: 'L',
  litre: 'L',
  litres: 'L',
  liter: 'L',
  cl: 'cl',
  centilitre: 'cl',
  centilitres: 'cl',
  piece: 'pièce',
  pieces: 'pièce',
  pcs: 'pièce',
  pc: 'pièce',
  unite: 'pièce',
  unites: 'pièce',
  bouteille: 'bouteille',
  bouteilles: 'bouteille',
  bottle: 'bouteille',
  btl: 'bouteille',
};

function mapUnit(raw: unknown): IngredientUnit | null {
  if (raw == null) return null;
  const normalized = normalizeHeader(String(raw));
  return UNIT_ALIASES[normalized] ?? null;
}

const recipeNameSchema = z.object({
  dishName: z
    .string({ error: 'Le nom du plat est requis' })
    .min(1, 'Le nom du plat est requis')
    .max(200, 'Le nom du plat doit faire 200 caracteres ou moins'),
  ingredientName: z
    .string({ error: "Le nom de l'ingredient est requis" })
    .min(1, "Le nom de l'ingredient est requis")
    .max(200, "Le nom de l'ingredient doit faire 200 caracteres ou moins"),
  notes: z.string().max(1000).nullable(),
});

// --- Service ----------------------------------------------

export interface RecipeImportService {
  parseExcel(buffer: ArrayBuffer): Promise<{ rows: ParsedRecipeRow[]; errors: ImportRowError[] }>;
  importFromExcel(tenantId: string, buffer: ArrayBuffer): Promise<RecipeImportResult>;
  generateTemplate(): Promise<Buffer>;
}

/**
 * Recipe (fiche technique) Excel import service.
 *
 * Pipeline: parse + Zod validation -> resolve dish name to a tenant-scoped
 * menu_item_id (unknown / ambiguous names become row errors, never a silent
 * pick) -> forward ONLY clean rows to the all-or-nothing import_recipes_tx RPC,
 * which get-or-creates missing ingredients and merge-upserts recipe lines.
 * MERGE (upsert), never REPLACE: removing a line from the sheet does not delete
 * the existing recipe line.
 */
export function createRecipeImportService(supabase: SupabaseClient): RecipeImportService {
  return {
    async parseExcel(
      buffer: ArrayBuffer,
    ): Promise<{ rows: ParsedRecipeRow[]; errors: ImportRowError[] }> {
      let rawData: unknown[][];
      try {
        rawData = await readFirstSheetRows(buffer);
      } catch {
        throw new ServiceError('Le fichier Excel ne contient aucune feuille', 'VALIDATION');
      }

      if (rawData.length < 2) {
        throw new ServiceError(
          'Le fichier Excel doit contenir une ligne d en-tete et au moins une ligne de donnees',
          'VALIDATION',
        );
      }

      const headerRow = (rawData[0] as unknown[]).map((c) => (c == null ? '' : String(c)));
      const headerMapping = mapHeaders(RECIPE_ALIASES, headerRow);
      const mappedFields = new Set(headerMapping.values());

      const required = ['dishName', 'ingredientName', 'unit', 'quantity'];
      const missing = required.filter((f) => !mappedFields.has(f));
      if (missing.length > 0) {
        throw new ServiceError(
          'Colonnes obligatoires manquantes. Colonnes attendues : Plat, Ingredient, Unite, Quantite, Notes',
          'VALIDATION',
        );
      }

      const rows: ParsedRecipeRow[] = [];
      const errors: ImportRowError[] = [];

      for (let i = 1; i < rawData.length; i++) {
        const cells = rawData[i] as unknown[];
        if (isEmptyRow(cells)) continue;

        const rowNumber = i + 1;

        const rawRow: Record<string, unknown> = {};
        for (const [colIndex, fieldName] of headerMapping.entries()) {
          rawRow[fieldName] = cells[colIndex] ?? null;
        }

        const unit = mapUnit(rawRow.unit);
        if (!unit) {
          errors.push({
            row: rowNumber,
            message: `Unite invalide : ${rawRow.unit ?? ''}`.trim(),
          });
          continue;
        }

        const quantity = parseNumericCell(rawRow.quantity);
        if (quantity === null || quantity <= 0) {
          errors.push({ row: rowNumber, message: 'La quantite doit etre un nombre positif' });
          continue;
        }

        const nameResult = recipeNameSchema.safeParse({
          dishName: rawRow.dishName != null ? String(rawRow.dishName).trim() : '',
          ingredientName: rawRow.ingredientName != null ? String(rawRow.ingredientName).trim() : '',
          notes:
            rawRow.notes != null && String(rawRow.notes).trim() !== ''
              ? String(rawRow.notes).trim()
              : null,
        });

        if (!nameResult.success) {
          const messages = nameResult.error.issues.map((issue) => issue.message).join('; ');
          errors.push({ row: rowNumber, message: messages });
          continue;
        }

        rows.push({
          rowNumber,
          dishName: nameResult.data.dishName,
          ingredientName: nameResult.data.ingredientName,
          unit,
          quantityNeeded: quantity,
          notes: nameResult.data.notes,
        });
      }

      return { rows, errors };
    },

    async importFromExcel(tenantId: string, buffer: ArrayBuffer): Promise<RecipeImportResult> {
      logger.info('Starting Excel recipe import', { tenantId });

      const { rows, errors: parseErrors } = await this.parseExcel(buffer);
      const errors: ImportRowError[] = [...parseErrors];

      const empty = (): RecipeImportResult => ({
        recipesCreated: 0,
        recipesUpdated: 0,
        ingredientsCreated: 0,
        itemsSkipped: errors.length,
        errors,
      });

      if (rows.length === 0) return empty();

      // Load menu items ONCE (tenant-scoped) and index by lower(name) so unknown
      // and AMBIGUOUS dish names become row errors before we ever hit the RPC.
      const { data: menuItems, error: menuError } = await supabase
        .from('menu_items')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);

      if (menuError) {
        throw new ServiceError('Erreur chargement des plats', 'INTERNAL', menuError);
      }

      const idsByLowerName = new Map<string, string[]>();
      for (const m of (menuItems as { id: string; name: string }[]) ?? []) {
        const key = m.name.toLowerCase();
        const list = idsByLowerName.get(key);
        if (list) list.push(m.id);
        else idsByLowerName.set(key, [m.id]);
      }

      const cleanRows: RecipeImportRpcRow[] = [];
      for (const row of rows) {
        const ids = idsByLowerName.get(row.dishName.toLowerCase());
        if (!ids || ids.length === 0) {
          errors.push({ row: row.rowNumber, message: `Plat introuvable : ${row.dishName}` });
          continue;
        }
        if (ids.length > 1) {
          errors.push({
            row: row.rowNumber,
            message: `Plat ambigu (plusieurs plats nommes "${row.dishName}")`,
          });
          continue;
        }
        cleanRows.push({
          menu_item_id: ids[0],
          ingredient_name: row.ingredientName,
          unit: row.unit,
          quantity_needed: row.quantityNeeded,
          notes: row.notes,
        });
      }

      if (cleanRows.length === 0) return empty();

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
        throw new ServiceError("Erreur lors de l'import des fiches techniques", 'INTERNAL', error);
      }

      const counts = (data ?? {}) as {
        recipes_created?: number;
        recipes_updated?: number;
        ingredients_created?: number;
      };

      return {
        recipesCreated: counts.recipes_created ?? 0,
        recipesUpdated: counts.recipes_updated ?? 0,
        ingredientsCreated: counts.ingredients_created ?? 0,
        itemsSkipped: errors.length,
        errors,
      };
    },

    async generateTemplate(): Promise<Buffer> {
      const XLSX = await import('xlsx');
      const headers = ['Dish', 'Ingredient', 'Unit', 'Quantity', 'Notes'];

      const exampleRows = [
        ['Poulet DG', 'Poulet', 'kg', 0.3, ''],
        ['Poulet DG', 'Plantain', 'kg', 0.2, 'Bien mur'],
        ['Poulet DG', 'Huile', 'cl', 5, ''],
        ['Jus de gingembre', 'Gingembre', 'g', 50, ''],
        ['Coca 33cl', 'Coca 33cl', 'bouteille', 1, ''],
      ];

      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...exampleRows]);
      worksheet['!cols'] = [{ wch: 26 }, { wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 28 }];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Recipes');

      return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    },
  };
}
