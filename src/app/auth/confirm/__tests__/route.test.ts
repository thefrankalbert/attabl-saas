import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Audit du 2026-11-10 (C-038): la page de connexion n'affiche que les codes
 * d'erreur qu'elle connait. Cette route envoyait des phrases, qui tombaient
 * toutes sur le message generique. Un nouvel inscrit ouvrant son courriel
 * apres une heure voyait "Une erreur est survenue", sans autre indication.
 */

const verifyOtp = vi.fn();

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/services/email.service', () => ({ sendWelcomeOnboardingEmail: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { verifyOtp },
    from: () => {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'limit']) c[m] = vi.fn(() => c);
      c.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
      return c;
    },
  }),
}));

import { GET } from '../route';

/** Les codes que la page de connexion sait traduire (AuthForm.tsx). */
const CODES_CONNUS = [
  'oauth_failed',
  'auth_failed',
  'session_expired',
  'email_not_confirmed',
  'access_denied',
  'invalid_token',
  'expired_link',
];

async function suivre(url: string): Promise<URL> {
  const reponse = await GET(new Request(url));
  return new URL(reponse.headers.get('location') ?? '');
}

describe('GET /auth/confirm', () => {
  beforeEach(() => vi.clearAllMocks());

  it('signale un lien expire par le code que la page de connexion affiche', async () => {
    verifyOtp.mockResolvedValue({ data: null, error: { message: 'Token has expired' } });

    const cible = await suivre('https://attabl.com/auth/confirm?token_hash=abc&type=signup');

    expect(cible.pathname).toBe('/login');
    expect(cible.searchParams.get('error')).toBe('expired_link');
  });

  it.each([
    ['lien sans jeton', 'https://attabl.com/auth/confirm?type=signup', null],
    [
      'erreur inattendue',
      'https://attabl.com/auth/confirm?token_hash=abc&type=signup',
      { message: 'boom' },
    ],
  ])('n envoie qu un code connu de la page de connexion (%s)', async (_cas, url, erreur) => {
    verifyOtp.mockResolvedValue({ data: null, error: erreur });

    const code = (await suivre(url)).searchParams.get('error');

    expect(CODES_CONNUS).toContain(code);
  });

  // Temoin: le chemin heureux n'est pas devenu une erreur.
  it('confirme et renvoie vers la connexion sans erreur', async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: null });

    const cible = await suivre('https://attabl.com/auth/confirm?token_hash=abc&type=signup');

    expect(cible.searchParams.get('confirmed')).toBe('true');
    expect(cible.searchParams.get('error')).toBeNull();
  });
});
