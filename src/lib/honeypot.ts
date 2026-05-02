export function isHoneypotTriggered(body: unknown): boolean {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return true;
  const val = (body as Record<string, unknown>).website;
  if (val === undefined) return true;
  if (typeof val !== 'string') return true;
  return val.length > 0;
}
