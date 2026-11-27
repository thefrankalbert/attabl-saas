import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Retour OAuth d'un compte existant (K6.13): avec un facteur verifie, la
 * session est aal1 et le compte passe par /auth/mfa, destination gardee dans
 * `next`. Sans facteur, rien ne change.
 */

const { exchangeCodeForSession } = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn() }));

const ROWS = [
  {
    id: 'au-1',
    tenant_id: 't1',
    is_super_admin: false,
    role: 'owner',
    is_active: true,
    deleted_at: null,
    tenants: {
      slug: 'resto',
      onboarding_completed: true,
      created_at: '2026-01-01',
      deleted_at: null,
    },
  },
];

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { verifyOtp: vi.fn(), exchangeCodeForSession },
    rpc: vi.fn(async () => ({ data: null, error: null })),
    from: () => ({
      select: () => ({ eq: async () => ({ data: ROWS, error: null }) }),
      insert: async () => ({ data: null, error: null }),
    }),
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock('@/services/signup.service', () => ({
  createSignupService: () => ({ completeOAuthSignup: vi.fn() }),
}));
vi.mock('@/lib/auth/alerte-nouvelle-connexion', () => ({
  traiterConnexionReussie: vi.fn(async () => null),
}));

import { GET } from '../route';

function sessionWith(factors: Array<{ status: string }>) {
  return {
    data: {
      session: {
        user: {
          id: 'user-1',
          email: 'o@exemple.test',
          created_at: '2026-01-01',
          app_metadata: { provider: 'google' },
          factors,
        },
      },
    },
    error: null,
  };
}

describe('GET /auth/callback (double authentification)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('facteur verifie: passe par /auth/mfa avec la destination dans next', async () => {
    exchangeCodeForSession.mockResolvedValue(sessionWith([{ status: 'verified' }]));
    const res = await GET(new Request('https://attabl.com/auth/callback?code=ok'));
    const to = new URL(res.headers.get('location') ?? '');
    expect(to.origin).toBe('https://attabl.com');
    expect(to.pathname).toBe('/auth/mfa');
    expect(to.searchParams.get('next')).toBe('/sites/resto/admin');
  });

  it('sans facteur: destination directe', async () => {
    exchangeCodeForSession.mockResolvedValue(sessionWith([]));
    const res = await GET(new Request('https://attabl.com/auth/callback?code=ok'));
    const to = new URL(res.headers.get('location') ?? '');
    expect(to.pathname).toBe('/sites/resto/admin');
  });
});
