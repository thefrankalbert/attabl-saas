import { z } from 'zod';
import { ServiceError } from '../errors';
import {
  findHeaderRow,
  mapHeaders,
  parseNumericCell,
  readFirstSheetRows,
  isEmptyRow,
  type ImportRowError,
} from '@/lib/excel-parse';
import type { ParsedRecipeRemoval, ParsedRecipeRow } from '@/types/inventory.types';
import { mapUnit } from './units';

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

const cellText = (v: unknown): string => (v == null ? '' : String(v).trim());

export interface ParsedRecipeSheet {
  rows: ParsedRecipeRow[];
  removals: ParsedRecipeRemoval[];
  errors: ImportRowError[];
}

/**
 * Read a recipe sheet (ATTABL export or a hand-made file). One line per
 * ingredient; quantity 0 = removal; a dish line without ingredient, unit and
 * quantity (exported dish without recipe) is skipped silently.
 */
export async function parseRecipeSheet(buffer: ArrayBuffer): Promise<ParsedRecipeSheet> {
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

  // Le modele ATTABL place un titre au-dessus des en-tetes (findHeaderRow).
  const required = ['dishName', 'ingredientName', 'unit', 'quantity'];
  const headerIndex = findHeaderRow(RECIPE_ALIASES, rawData, required);
  if (headerIndex === -1) {
    throw new ServiceError(
      'Colonnes obligatoires manquantes. Colonnes attendues : Plat, Ingredient, Unite, Quantite, Notes',
      'VALIDATION',
    );
  }

  const headerRow = (rawData[headerIndex] ?? []).map((c) => (c == null ? '' : String(c)));
  const headerMapping = mapHeaders(RECIPE_ALIASES, headerRow);
  const rows: ParsedRecipeRow[] = [];
  const removals: ParsedRecipeRemoval[] = [];
  const errors: ImportRowError[] = [];

  for (let i = headerIndex + 1; i < rawData.length; i++) {
    const cells = rawData[i] as unknown[];
    if (isEmptyRow(cells)) continue;

    const rowNumber = i + 1;

    const rawRow: Record<string, unknown> = {};
    for (const [colIndex, fieldName] of headerMapping.entries()) {
      rawRow[fieldName] = cells[colIndex] ?? null;
    }

    // A dish exported without a recipe comes back as "dish + empty line":
    // nothing to import, and nothing to report.
    if (
      cellText(rawRow.ingredientName) === '' &&
      cellText(rawRow.unit) === '' &&
      cellText(rawRow.quantity) === ''
    ) {
      continue;
    }

    const nameResult = recipeNameSchema.safeParse({
      dishName: cellText(rawRow.dishName),
      ingredientName: cellText(rawRow.ingredientName),
      notes: cellText(rawRow.notes) !== '' ? cellText(rawRow.notes) : null,
    });

    const quantity = parseNumericCell(rawRow.quantity);

    // Quantity 0 = remove this ingredient from the dish (unit not needed).
    if (quantity === 0) {
      if (!nameResult.success) {
        errors.push({
          row: rowNumber,
          message: nameResult.error.issues.map((issue) => issue.message).join('; '),
        });
        continue;
      }
      removals.push({
        rowNumber,
        dishName: nameResult.data.dishName,
        ingredientName: nameResult.data.ingredientName,
      });
      continue;
    }

    const unit = mapUnit(rawRow.unit);
    if (!unit) {
      errors.push({
        row: rowNumber,
        message: `Unite invalide : ${rawRow.unit ?? ''}`.trim(),
      });
      continue;
    }

    if (quantity === null || quantity < 0) {
      errors.push({ row: rowNumber, message: 'La quantite doit etre un nombre positif' });
      continue;
    }

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

  return { rows, removals, errors };
}
