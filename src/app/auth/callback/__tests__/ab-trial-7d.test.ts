import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Audit B13: la variante d'essai A/B "7 jours" (cookie `attabl_ab_trial`, NON
 * signe, pose par le client) ecrasait `trial_ends_at` sans condition. Un essai
 * "partage" (fin restante d'un autre restaurant) ou termine pouvait ainsi etre
 * REPOUSSE. La variante ne doit que RACCOURCIR: l'ecriture porte le filtre
 * `trial_ends_at > maintenant + 7 j`, donc elle ne touche jamais une fin plus
 * proche ni un essai deja fini.
 */

const h = vi.hoisted(() => ({
  updates: [] as Array<{
    patch: Record<string, unknown>;
    filters: Array<[string, string, unknown]>;
  }>,
}));

function tenantsUpdateChain(patch: Record<string, unknown>) {
  const entry = { patch, filters: [] as Array<[string, string, unknown]> };
  h.updates.push(entry);
  const c: Record<string, unknown> = {};
  for (const op of ['eq', 'gt', 'lt', 'is']) {
    c[op] = (col: string, val: unknown) => {
      entry.filters.push([op, col, val]);
      return c;
    };
  }
  c.select = () => c;
  c.then = (ok: (v: unknown) => unknown) =>
    Promise.resolve({ data: [{ id: 't-1' }], error: null }).then(ok);
  return c;
}

const adminClient = { from: () => ({ update: tenantsUpdateChain }) };

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: async () => ({
        data: { session: { user: { id: 'u-1', email: 'a@b.c' } } },
        error: null,
      }),
    },
    from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }),
  }),
}));
vi.mock('@/services/signup.service', () => ({
  createSignupService: () => ({
    completeOAuthSignup: async () => ({ tenantId: 't-1', slug: 'resto' }),
  }),
}));

import { GET } from '../route';

function call(cookie?: string) {
  return GET(
    new Request('https://attabl.com/auth/callback?code=abc', {
      headers: cookie ? { cookie } : {},
    }),
  );
}

beforeEach(() => {
  h.updates = [];
});

describe('GET /auth/callback - variante d essai 7 jours (B13)', () => {
  it('ne fait que raccourcir: filtre trial_ends_at > maintenant + 7 j', async () => {
    await call('attabl_ab_trial=7d');
    expect(h.updates).toHaveLength(1);
    const { patch, filters } = h.updates[0]!;
    expect(filters).toContainEqual(['eq', 'id', 't-1']);
    expect(filters).toContainEqual(['gt', 'trial_ends_at', patch.trial_ends_at]);
  });

  it('temoin: sans cookie, aucune ecriture', async () => {
    await call();
    expect(h.updates).toHaveLength(0);
  });
});
