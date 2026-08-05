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
 * Aplatit une valeur de cellule exceljs vers la valeur simple que le reste du
 * code attend.
 *
 * exceljs ne rend pas toujours un scalaire: une formule arrive en
 * `{ formula, result }`, un texte enrichi en `{ richText: [...] }`, un lien en
 * `{ text, hyperlink }`. Sans cette normalisation, un fichier client contenant
 * une simple formule de total ou une cellule mise en forme donnerait `[object
 * Object]` a l'import au lieu de sa valeur.
 */
function flattenCell(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value !== 'object') return value;

  const cell = value as Record<string, unknown>;
  if ('result' in cell) return flattenCell(cell.result);
  if ('text' in cell) return cell.text;
  if (Array.isArray(cell.richText)) {
    return cell.richText.map((part) => (part as { text?: string }).text ?? '').join('');
  }
  if ('error' in cell) return null;
  return value;
}

/**
 * Reads the first sheet of an Excel workbook as an array-of-arrays (aoa).
 * The first inner array is the header row.
 *
 * Lu avec exceljs, deja utilise pour l'EXPORT. La bibliotheque xlsx (SheetJS) a
 * ete retiree du projet: sa derniere version publiee sur npm (0.18.5) porte deux
 * failles hautes non corrigees (pollution de prototype et ReDoS), et l'editeur ne
 * publie plus les correctifs que sur son propre CDN. Ces failles s'ouvraient sur
 * un fichier UPLOADE par un utilisateur, donc sur une entree non fiable.
 *
 * @throws when the workbook contains no sheet.
 */
export async function readFirstSheetRows(buffer: ArrayBuffer): Promise<unknown[][]> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];

  if (!sheet) {
    throw new Error('EMPTY_WORKBOOK');
  }

  const rows: unknown[][] = [];
  // `includeEmpty` garde les lignes vides intercalees: isEmptyRow s'en charge
  // ensuite, et les sauter ici decalerait la numerotation vue par l'utilisateur
  // dans les messages d'erreur ("ligne 7").
  sheet.eachRow({ includeEmpty: true }, (row) => {
    // `row.values` est indexe a partir de 1 (la case 0 est toujours vide).
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    rows.push(values.map(flattenCell));
  });

  return rows;
}

/** True when a sheet row is entirely empty (all cells null/undefined/''). */
export function isEmptyRow(cells: unknown[] | undefined): boolean {
  return (
    !cells || cells.length === 0 || cells.every((c) => c === null || c === undefined || c === '')
  );
}
