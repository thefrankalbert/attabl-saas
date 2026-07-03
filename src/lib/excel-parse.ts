/**
 * Shared low-level Excel parsing helpers.
 *
 * Extracted so the supplier + recipe importers reuse the exact same tolerant
 * header matching / cell coercion as the menu importer without duplicating it
 * (and without appending to the already 539-line excel-import.service.ts, which
 * would break the <400-line rule and risk a menu-import regression).
 *
 * Pure TypeScript: no Next.js, no Supabase imports. Safe to import from services.
 */

/** One row-level import error, surfaced to the user with the sheet row number. */
export interface ImportRowError {
  row: number;
  message: string;
}

/**
 * Normalizes a column header for tolerant matching:
 * - Lowercases
 * - Strips accents (NFD normalization)
 * - Removes all whitespace
 */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
}

/**
 * Builds a header-to-field mapping from the actual Excel headers.
 *
 * @param aliases - map of canonical field name -> accepted normalized aliases
 * @param headers - the raw header cells from the first sheet row
 * @returns a map from column index to canonical field name
 */
export function mapHeaders(
  aliases: Record<string, string[]>,
  headers: string[],
): Map<number, string> {
  const mapping = new Map<number, string>();

  // Reverse lookup: normalized alias -> canonical field name.
  const aliasLookup = new Map<string, string>();
  for (const [field, fieldAliases] of Object.entries(aliases)) {
    for (const alias of fieldAliases) {
      aliasLookup.set(alias, field);
    }
  }

  for (let i = 0; i < headers.length; i++) {
    const normalized = normalizeHeader(headers[i]);
    const field = aliasLookup.get(normalized);
    // First column wins for a given field (ignore duplicate header columns).
    if (field && !Array.from(mapping.values()).includes(field)) {
      mapping.set(i, field);
    }
  }

  return mapping;
}

/**
 * Parses a cell value into a number or null.
 * Handles string prices like "12,50", "12.50" or "$12.50".
 */
export function parseNumericCell(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = String(value)
    .replace(/[^0-9.,-]/g, '')
    .replace(',', '.');
  const parsed = parseFloat(cleaned);

  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Parses a cell value into a boolean.
 * Supports: Y/N, Yes/No, Oui/Non, O/N, 1/0, true/false, V/X, vrai/faux.
 */
export function parseBooleanCell(value: unknown, defaultValue: boolean): boolean {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  const normalized = String(value).trim().toLowerCase();
  const truthyValues = ['y', 'yes', 'oui', 'o', 'true', '1', 'v', 'vrai'];
  const falsyValues = ['n', 'no', 'non', 'false', '0', 'x', 'faux'];

  if (truthyValues.includes(normalized)) return true;
  if (falsyValues.includes(normalized)) return false;

  return defaultValue;
}

/**
 * Reads the first sheet of an Excel workbook as an array-of-arrays (aoa).
 * The first inner array is the header row. Empty trailing cells are preserved
 * by the underlying reader as sparse arrays.
 *
 * @throws when the workbook contains no sheet.
 */
export async function readFirstSheetRows(buffer: ArrayBuffer): Promise<unknown[][]> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error('EMPTY_WORKBOOK');
  }

  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
}

/** True when a sheet row is entirely empty (all cells null/undefined/''). */
export function isEmptyRow(cells: unknown[] | undefined): boolean {
  return (
    !cells || cells.length === 0 || cells.every((c) => c === null || c === undefined || c === '')
  );
}
