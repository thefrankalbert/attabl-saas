/** Obscure field name - avoid "website" (browser autofill triggers false positives). */
export const HONEYPOT_FIELD = '_hp';

export function isDevAuthBypassEnabled(): boolean {
  return process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH_BYPASS === 'true';
}

export function isHoneypotTriggered(body: unknown): boolean {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return true;
  const record = body as Record<string, unknown>;
  const val = record[HONEYPOT_FIELD] ?? record.website;
  if (val === undefined || val === null) return false;
  if (typeof val !== 'string') return true;
  return val.trim().length > 0;
}
