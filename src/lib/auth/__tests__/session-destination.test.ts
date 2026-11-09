import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

import { loadSessionMemberships } from '../session-destination';

function client(result: { data: unknown; error: unknown }, seen: string[] = []) {
  return {
    from: () => ({
      select: (cols: string) => {
        seen.push(cols);
        return { eq: async () => result };
      },
    }),
  } as unknown as SupabaseClient;
}

describe('loadSessionMemberships', () => {
  it('rend null sur erreur (jamais "aucun restaurant" sur une panne)', async () => {
    await expect(
      loadSessionMemberships(client({ data: null, error: { message: 'x' } }), 'u1'),
    ).resolves.toBeNull();
  });

  it('lit la suppression de l etablissement (sinon boucle /login <-> espace)', async () => {
    const seen: string[] = [];
    const rows = await loadSessionMemberships(
      client(
        {
          data: [{ role: 'owner', tenants: { slug: 's', deleted_at: '2026-11-01T00:00:00Z' } }],
          error: null,
        },
        seen,
      ),
      'u1',
    );
    expect(seen[0]).toContain('deleted_at)');
    expect(rows?.[0].tenantDeletedAt).toBe('2026-11-01T00:00:00Z');
  });
});
