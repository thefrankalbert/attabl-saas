// --- Cell Parsing ---------------------------------------------

/**
 * Parses a cell value into a boolean.
 * Supports: Y/N, Yes/No, Oui/Non, 1/0, true/false, V/X
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
 * Parses a cell value into a number or null.
 */
export function parseNumericCell(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  // Handle string prices like "12,50" or "12.50" or "$12.50"
  const cleaned = String(value)
    .replace(/[^0-9.,]/g, '')
    .replace(',', '.');
  const parsed = parseFloat(cleaned);

  return isNaN(parsed) ? null : parsed;
}
