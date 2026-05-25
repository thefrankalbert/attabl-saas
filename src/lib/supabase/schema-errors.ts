/**
 * Detect PostgREST / Postgres errors when a table or column is missing on the remote DB.
 */
export function isMissingRelationError(error: unknown, relation?: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: string; message?: string; details?: string };
  const haystack =
    `${record.code ?? ''} ${record.message ?? ''} ${record.details ?? ''}`.toLowerCase();
  if (record.code === 'PGRST205' || record.code === '42P01') return true;
  if (haystack.includes('could not find the table')) return true;
  if (relation && haystack.includes(relation.toLowerCase())) return true;
  return false;
}
