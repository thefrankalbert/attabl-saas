import { ServiceError } from '../errors';
import { findHeaderRow, readFirstSheetRows } from '@/lib/excel-parse';
import { COLUMN_ALIASES, mapHeaders } from './columns';
import { excelRowSchema } from './row-schema';
import { parseBooleanCell, parseNumericCell } from './cells';
import type { ParsedRow, ImportRowError } from './types';

// --- Excel Parsing --------------------------------------------

/**
 * Parses an Excel ArrayBuffer into validated rows.
 * Collects errors per row instead of throwing on the first invalid row.
 */
export async function parseExcelBuffer(
  buffer: ArrayBuffer,
): Promise<{ rows: ParsedRow[]; errors: ImportRowError[] }> {
  // Lecture partagee avec l'import de fiches techniques: une seule
  // implementation, donc un seul endroit ou la lecture de fichiers uploades peut
  // se tromper. Voir readFirstSheetRows pour le retrait de SheetJS.
  let rawData: unknown[][];
  try {
    rawData = await readFirstSheetRows(buffer);
  } catch (error) {
    if (error instanceof Error && error.message === 'EMPTY_WORKBOOK') {
      throw new ServiceError('Le fichier Excel ne contient aucune feuille', 'VALIDATION');
    }
    throw error;
  }

  // Le modele ATTABL place un titre au-dessus des en-tetes: on cherche la ligne
  // qui porte les colonnes obligatoires au lieu de supposer la ligne 1.
  const headerIndex = findHeaderRow(COLUMN_ALIASES, rawData, ['category', 'name', 'price']);
  if (headerIndex === -1) {
    throw new ServiceError(
      'Colonnes obligatoires introuvables : Categorie, Nom du plat, Prix. ' +
        'Gardez la ligne d en-tetes du modele telle quelle.',
      'VALIDATION',
    );
  }

  const headerMapping = mapHeaders((rawData[headerIndex] ?? []).map((c) => String(c ?? '')));
  const rows: ParsedRow[] = [];
  const errors: ImportRowError[] = [];

  for (let i = headerIndex + 1; i < rawData.length; i++) {
    const cells = rawData[i] as unknown[];

    // Skip completely empty rows
    if (
      !cells ||
      cells.length === 0 ||
      cells.every((c) => c === null || c === undefined || c === '')
    ) {
      continue;
    }

    const rowNumber = i + 1; // 1-based for user-facing messages

    // Extract values using the header mapping
    const rawRow: Record<string, unknown> = {};
    for (const [colIndex, fieldName] of headerMapping.entries()) {
      rawRow[fieldName] = cells[colIndex] ?? null;
    }

    // Coerce types before validation
    const rowToValidate = {
      category: rawRow.category != null ? String(rawRow.category).trim() : '',
      categoryEn: rawRow.categoryEn != null ? String(rawRow.categoryEn).trim() || null : null,
      name: rawRow.name != null ? String(rawRow.name).trim() : '',
      nameEn: rawRow.nameEn != null ? String(rawRow.nameEn).trim() || null : null,
      description: rawRow.description != null ? String(rawRow.description).trim() || null : null,
      descriptionEn:
        rawRow.descriptionEn != null ? String(rawRow.descriptionEn).trim() || null : null,
      price: parseNumericCell(rawRow.price),
      // Case vide = null: a la creation le plat prend la valeur par defaut, a la
      // mise a jour d'un plat existant on garde sa valeur actuelle.
      isAvailable: isBlankCell(rawRow.available) ? null : parseBooleanCell(rawRow.available, true),
      isFeatured: isBlankCell(rawRow.featured) ? null : parseBooleanCell(rawRow.featured, false),
    };

    // Handle null price before Zod (Zod expects number, not null)
    if (rowToValidate.price === null) {
      errors.push({ row: rowNumber, message: 'Prix manquant ou illisible' });
      continue;
    }

    const result = excelRowSchema.safeParse(rowToValidate);

    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message).join('; ');
      errors.push({ row: rowNumber, message: messages });
      continue;
    }

    rows.push({
      rowNumber,
      category: result.data.category,
      categoryEn: result.data.categoryEn ?? null,
      name: result.data.name,
      nameEn: result.data.nameEn ?? null,
      description: result.data.description ?? null,
      descriptionEn: result.data.descriptionEn ?? null,
      price: result.data.price,
      isAvailable: result.data.isAvailable,
      isFeatured: result.data.isFeatured,
    });
  }

  return { rows, errors };
}

function isBlankCell(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === '';
}
