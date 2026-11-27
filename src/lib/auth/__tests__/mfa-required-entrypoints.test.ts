import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Double authentification des operations authentifiees (K6.13, defaut haute
 * gravite): un compte avec facteur verifie en session aal1 (mot de passe seul)
 * agissait par l'API et les Server Actions. Couvre la regle, une fonction
 * commune (getAuthenticatedUser), une route a appel direct (reset-password),
 * et les points d'entree qui doivent RESTER ouverts en aal1 (actions MFA,
 * deconnexion).
 */

const h = vi.hoisted(() => {
  const etat = {
    user: null as null | { id: string; email: string; factors: unknown[] },
    aal: 'aal1' as 'aal1' | 'aal2' | 'panne',
  };
  const getClaims = vi.fn(async () =>
    etat.aal === 'panne'
      ? { data: null, error: { message: 'jeton illisible' } }
      : { data: { claims: { aal: etat.aal } }, error: null },
  );
  const updateUser = vi.fn(async () => ({ error: null }));
  const signOut = vi.fn(async () => ({ error: null }));
  return { etat, getClaims, updateUser, signOut };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: h.etat.user },
        error: h.etat.user ? null : { message: 'no session' },
      }),
      getClaims: h.getClaims,
      updateUser: h.updateUser,
      signOut: h.signOut,
      mfa: { challengeAndVerify: vi.fn(), unenroll: vi.fn(), enroll: vi.fn() },
    },
  }),
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7' }),
  cookies: async () => ({ get: () => undefined, delete: vi.fn() }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/csrf', () => ({ verifyOrigin: () => null }));
vi.mock('@/lib/rate-limit', () => {
  const ok = { check: vi.fn(async () => ({ success: true, reset: 0 })) };
  return {
    forgotPasswordAdresseLimiter: ok,
    signoutLimiter: ok,
    loginAdresseLimiter: ok,
    loginPaireLimiter: ok,
    getClientIp: () => '203.0.113.7',
    getClientIpFromHeaders: () => '203.0.113.7',
  };
});

import { isMfaSatisfied, MFA_REQUIRED_CODE, MFA_REQUIRED_MESSAGE } from '../mfa-assurance';
import { AuthError, getAuthenticatedUser } from '../get-session';
import { POST as RESET_PASSWORD } from '@/app/api/reset-password/route';
import { POST as SIGNOUT } from '@/app/api/auth/signout/route';
import { actionGetMfaStatus } from '@/app/actions/mfa';

const VERIFIED = { id: 'f-ok', factor_type: 'totp', status: 'verified' };
const AVEC_FACTEUR = { id: 'u-1', email: 'a@resto.test', factors: [VERIFIED] };
const SANS_FACTEUR = { id: 'u-2', email: 'b@resto.test', factors: [] };

function resetRequest(): Request {
  return new Request('http://localhost/api/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountEmail: 'a@resto.test', password: 'MotDePasse-Solide-1' }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.etat.user = AVEC_FACTEUR;
  h.etat.aal = 'aal1';
});

describe('isMfaSatisfied (la regle unique)', () => {
  type Client = Parameters<typeof isMfaSatisfied>[0];
  const client = { auth: { getClaims: h.getClaims } } as unknown as Client;

  it('compte sans facteur: satisfait, sans lire le niveau (aucun appel de plus)', async () => {
    expect(await isMfaSatisfied(client, SANS_FACTEUR as never)).toBe(true);
    expect(h.getClaims).not.toHaveBeenCalled();
  });

  it('facteur + aal1: refuse', async () => {
    expect(await isMfaSatisfied(client, AVEC_FACTEUR as never)).toBe(false);
  });

  it('facteur + aal2: accepte', async () => {
    h.etat.aal = 'aal2';
    expect(await isMfaSatisfied(client, AVEC_FACTEUR as never)).toBe(true);
  });

  it('facteur + niveau illisible: refuse (echec ferme)', async () => {
    h.etat.aal = 'panne';
    expect(await isMfaSatisfied(client, AVEC_FACTEUR as never)).toBe(false);
  });
});

describe('fonction commune: getAuthenticatedUser', () => {
  it('facteur + aal1: AuthError 403 "Double authentification requise"', async () => {
    const err = await getAuthenticatedUser().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err).toMatchObject({ status: 403, message: MFA_REQUIRED_MESSAGE });
  });

  it('facteur + aal2: accepte', async () => {
    h.etat.aal = 'aal2';
    await expect(getAuthenticatedUser()).resolves.toMatchObject({ user: { id: 'u-1' } });
  });

  it('sans facteur: comportement inchange, niveau jamais lu', async () => {
    h.etat.user = SANS_FACTEUR;
    await expect(getAuthenticatedUser()).resolves.toMatchObject({ user: { id: 'u-2' } });
    expect(h.getClaims).not.toHaveBeenCalled();
  });

  it('facteur + niveau illisible: 403', async () => {
    h.etat.aal = 'panne';
    await expect(getAuthenticatedUser()).rejects.toMatchObject({ status: 403 });
  });

  it('sans session: 401 comme avant', async () => {
    h.etat.user = null;
    await expect(getAuthenticatedUser()).rejects.toMatchObject({ status: 401 });
  });
});

describe('route a appel direct: POST /api/reset-password', () => {
  it('facteur + aal1: 403 MFA_REQUIRED, mot de passe NON change', async () => {
    const res = await RESET_PASSWORD(resetRequest());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: MFA_REQUIRED_CODE });
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it('facteur + niveau illisible: 403 MFA_REQUIRED', async () => {
    h.etat.aal = 'panne';
    const res = await RESET_PASSWORD(resetRequest());
    expect(res.status).toBe(403);
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it('facteur + aal2: la regle laisse passer (refus suivant = marqueur absent)', async () => {
    h.etat.aal = 'aal2';
    const res = await RESET_PASSWORD(resetRequest());
    expect(await res.json()).toEqual({ code: 'NO_RECOVERY' });
  });

  it('sans facteur: inchange (refus suivant = marqueur absent, niveau jamais lu)', async () => {
    h.etat.user = SANS_FACTEUR;
    const res = await RESET_PASSWORD(resetRequest());
    expect(await res.json()).toEqual({ code: 'NO_RECOVERY' });
    expect(h.getClaims).not.toHaveBeenCalled();
  });
});

describe('points d entree ouverts en aal1 (atteindre aal2 ou sortir)', () => {
  it('actionGetMfaStatus repond en aal1', async () => {
    expect(await actionGetMfaStatus()).toEqual({ success: true, enabled: true });
  });

  it('la deconnexion fonctionne en aal1', async () => {
    const res = await SIGNOUT(new Request('http://localhost/api/auth/signout', { method: 'POST' }));
    expect(res.status).toBe(302);
    expect(h.signOut).toHaveBeenCalled();
  });
});
