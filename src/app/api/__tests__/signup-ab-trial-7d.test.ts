import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Audit B13: la variante A/B "7 jours" (cookie client non signe) ecrasait
 * `trial_ends_at` sans condition dans /api/signup. Un essai partage ou termine
 * pouvait etre repousse. Elle ne doit que RACCOURCIR.
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
  c.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
  return c;
}

vi.mock('@/lib/rate-limit', () => ({
  signupLimiter: { check: async () => ({ success: true }) },
  adminPasswordResetLinkLimiter: { check: async () => ({ success: true }) },
  cleCompte: (email: string) => email,
  getClientIp: () => '127.0.0.1',
  getClientIpBrute: () => '127.0.0.1',
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ update: tenantsUpdateChain }) }),
}));
vi.mock('@/services/signup.service', () => ({
  createSignupService: () => ({
    completeEmailSignup: async () => ({ slug: 'resto', tenantId: 't-1', emailDelivered: true }),
  }),
}));
vi.mock('@/services/restaurant-name.service', () => ({ isRestaurantNameTaken: async () => false }));
vi.mock('@/services/email.service', () => ({ sendSignupAccountExistsEmail: async () => true }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));

import { HONEYPOT_FIELD } from '@/lib/honeypot';
import { POST } from '@/app/api/signup/route';

function call(cookie?: string) {
  return POST(
    new Request('http://localhost/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({
        restaurantName: 'Le Petit Bistrot',
        email: 'owner@bistrot.com',
        password: 'securePass123',
        [HONEYPOT_FIELD]: '',
      }),
    }),
  );
}

beforeEach(() => {
  h.updates = [];
});

describe('POST /api/signup - variante d essai 7 jours (B13)', () => {
  it('ne fait que raccourcir: filtre trial_ends_at > maintenant + 7 j', async () => {
    const res = await call('attabl_ab_trial=7d');
    expect(res.status).toBe(200);
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
