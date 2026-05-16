import { z } from 'zod';

export const routeUuidSchema = z.string().uuid('Identifiant invalide');

export function parseRouteUuid(
  id: string,
): { ok: true; id: string } | { ok: false; error: string } {
  const result = routeUuidSchema.safeParse(id);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? 'Identifiant invalide';
    return { ok: false, error: message };
  }
  return { ok: true, id: result.data };
}
