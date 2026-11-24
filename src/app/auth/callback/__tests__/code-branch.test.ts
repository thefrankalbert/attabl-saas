import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Branche `?code=` du callback (alerte CodeQL js/user-controlled-bypass, examinee
 * le 2026-11-21): le `code` vient de l'URL, mais il ne decide de rien seul. Le
 * compte et la creation d'etablissement (client service_role) dependent de la
 * session que Supabase rend APRES avoir verifie le code (PKCE). Un code forge ne
 * mene qu'a /login, et aucune redirection ne quitte l'origine de la requete.
 */

const { exchangeCodeForSession, createAdminClient, completeOAuthSignup } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  createAdminClient: vi.fn(() => ({})),
  completeOAuthSignup: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { verifyOtp: vi.fn(), exchangeCodeForSession },
    from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }),
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }));
vi.mock('@/services/signup.service', () => ({
  createSignupService: () => ({ completeOAuthSignup }),
}));

import { GET } from '../route';

const EVIL = 'next=https%3A%2F%2Fevil.example&redirect_to=https%3A%2F%2Fevil.example';

describe('GET /auth/callback (code)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('un code forge (refuse par Supabase) ne cree rien et renvoie vers /login', async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'invalid flow state', code: 'bad_code_verifier', status: 400 },
    });

    const res = await GET(
      new Request(`https://attabl.com/auth/callback?code=forge&type=signup&plan=business&${EVIL}`),
    );
    const to = new URL(res.headers.get('location') ?? '');

    expect(to.origin).toBe('https://attabl.com');
    expect(to.pathname).toBe('/login');
    expect(to.searchParams.get('error')).toBe('oauth_failed');
    // B66: le message brut de GoTrue ne part pas dans l'URL.
    expect(to.search).not.toContain('invalid');
    expect(to.searchParams.get('reason')).toBeNull();
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(completeOAuthSignup).not.toHaveBeenCalled();
  });

  it('code accepte mais sans session: rien n est cree, retour a /login', async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: null });

    const res = await GET(new Request(`https://attabl.com/auth/callback?code=ok&${EVIL}`));
    const to = new URL(res.headers.get('location') ?? '');

    expect(to.origin).toBe('https://attabl.com');
    expect(to.pathname).toBe('/login');
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('code verifie: la creation part du compte de la session, pas de l URL', async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'u-session', email: 'a@b.c' } } },
      error: null,
    });
    completeOAuthSignup.mockResolvedValue({ tenantId: 't-1' });

    const res = await GET(
      new Request(
        `https://attabl.com/auth/callback?code=ok&plan=business&restaurant_name=Pirate&user_id=u-autre&${EVIL}`,
      ),
    );
    const to = new URL(res.headers.get('location') ?? '');

    expect(to.origin).toBe('https://attabl.com');
    expect(to.pathname).toBe('/onboarding');
    expect(completeOAuthSignup).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-session', email: 'a@b.c', plan: 'starter' }),
    );
    // B18: `plan` et `restaurant_name` de l'URL ne sont plus lus.
    expect(completeOAuthSignup).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantName: 'Mon Établissement' }),
    );
  });

  // B17: un echec de creation renvoyait vers /signup?error=<phrase libre>, que
  // la page n'affiche jamais (bandeau en mode connexion seulement, codes
  // connus seulement). L'utilisateur revenait sur un formulaire muet.
  it('B17: echec de la creation Google: /login avec un code que la page affiche', async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'u-session', email: 'a@b.c' } } },
      error: null,
    });
    completeOAuthSignup.mockRejectedValue(new Error('boom'));

    const res = await GET(new Request(`https://attabl.com/auth/callback?code=ok`));
    const to = new URL(res.headers.get('location') ?? '');

    expect(to.origin).toBe('https://attabl.com');
    expect(to.pathname).toBe('/login');
    expect(to.searchParams.get('error')).toBe('oauth_failed');
    // Rien de libre ni de personnel dans l'URL.
    expect(to.searchParams.get('email')).toBeNull();
  });
});
