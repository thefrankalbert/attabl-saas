import { ServiceError } from '../errors';
import { readFirstSheetRows } from '@/lib/excel-parse';
import { mapHeaders } from './columns';
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
      throw new ServiceError('The Excel file contains no sheets', 'VALIDATION');
    }
    throw error;
  }

  if (rawData.length < 2) {
    throw new ServiceError(
      'The Excel file must contain at least a header row and one data row',
      'VALIDATION',
    );
  }

  // First row is headers
  const headerRow = rawData[0] as string[];
  const headerMapping = mapHeaders(headerRow.map(String));

  // Verify that required columns are present
  const mappedFields = new Set(headerMapping.values());
  const requiredFields = ['category', 'name', 'price'];
  const missingFields = requiredFields.filter((f) => !mappedFields.has(f));

  if (missingFields.length > 0) {
    throw new ServiceError(
      `Missing required columns: ${missingFields.join(', ')}. ` +
        `Expected columns: Category, Dish Name, Price`,
      'VALIDATION',
    );
  }

  const rows: ParsedRow[] = [];
  const errors: ImportRowError[] = [];

  // Process data rows (skip header at index 0)
  for (let i = 1; i < rawData.length; i++) {
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
      isAvailable: parseBooleanCell(rawRow.available, true),
      isFeatured: parseBooleanCell(rawRow.featured, false),
    };

    // Handle null price before Zod (Zod expects number, not null)
    if (rowToValidate.price === null) {
      errors.push({ row: rowNumber, message: 'Price is required and must be a valid number' });
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
