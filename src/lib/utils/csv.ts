/**
 * Sanitize a value for CSV output — escapes quotes and prevents formula injection.
 */
export function csvCell(value: string): string {
  const escaped = String(value).replace(/"/g, '""');
  const safe = /^[=+\-@\t\r]/.test(escaped) ? `'${escaped}` : escaped;
  return `"${safe}"`;
}
