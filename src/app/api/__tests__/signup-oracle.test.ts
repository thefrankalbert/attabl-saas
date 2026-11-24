import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Contre-audit 2 du lot B2b-3b: aucune difference de reponse ne doit dire si
 * une adresse a un compte. Ici, le VRAI service d'inscription et la vraie
 * route, devant un faux GoTrue qui suit l'ordre de la production (v2.198):
 * adresse deja inscrite d'abord (`email_exists`), puis force du mot de passe
 * (`weak_password`, 422), puis creation.
 */

const { existingEmails, sendExists, sendRejected, sendFailed, sendWelcome, recipientCheck } =
  vi.hoisted(() => ({
    existingEmails: new Set<string>(),
    sendExists: vi.fn(),
    sendRejected: vi.fn(),
    sendFailed: vi.fn(),
    sendWelcome: vi.fn(),
    recipientCheck: vi.fn(),
  }));

const STRONG = 'Maquis-2026!Awa';
// Valide pour le site, refuse par GoTrue (cas des mots de passe pirates, HIBP).
const PWNED = 'Bienvenue-2026!';
// Contre-audit 4: GoTrue refuse au-dela de 72 octets (`validation_failed`,
// password.go:32), APRES le test d'existence. Le site borne desormais lui-meme;
// ce marqueur simule un GoTrue plus strict que le site, pour eprouver le chemin.
const GOTRUE_TOO_LONG = 'Trop-Long-Pour-GoTrue-7';
// HIBP injoignable en echec ferme: erreur 500 de GoTrue (password.go:59-61).
const HIBP_DOWN = 'Panne-Hibp-2026!';

const fakeAdminClient = {
  auth: {
    admin: {
      createUser: async ({ email, password }: { email: string; password: string }) => {
        if (existingEmails.has(email)) {
          return {
            data: { user: null },
            error: {
              code: 'email_exists',
              status: 422,
              message: 'A user with this email address has already been registered',
            },
          };
        }
        if (new TextEncoder().encode(password).length > 72 || password === GOTRUE_TOO_LONG) {
          return {
            data: { user: null },
            error: {
              code: 'validation_failed',
              status: 400,
              message: 'Password cannot be longer than 72 characters',
            },
          };
        }
        if (password === HIBP_DOWN) {
          return {
            data: { user: null },
            error: { code: 'unexpected_failure', status: 500, message: 'HIBP check failed' },
          };
        }
        if (password === PWNED) {
          return {
            data: { user: null },
            error: {
              code: 'weak_password',
              status: 422,
              message: 'Password is known to be weak and easy to guess',
            },
          };
        }
        return { data: { user: { id: 'u-neuf' } }, error: null };
      },
      deleteUser: vi.fn(),
      generateLink: async () => ({
        data: { properties: { hashed_token: 'jeton' } },
        error: null,
      }),
    },
  },
  rpc: async () => ({ data: { tenantId: 't-neuf', slug: 'chez-awa' }, error: null }),
};

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeAdminClient }));
vi.mock('@/services/slug.service', () => ({
  createSlugService: () => ({ generateUniqueSlug: async () => 'chez-awa' }),
}));
vi.mock('@/services/restaurant-name.service', () => ({ isRestaurantNameTaken: async () => false }));
vi.mock('@/services/email.service', () => ({
  sendWelcomeConfirmationEmail: (...a: unknown[]) => sendWelcome(...a),
  sendSignupAccountExistsEmail: (...a: unknown[]) => sendExists(...a),
  sendSignupPasswordRejectedEmail: (...a: unknown[]) => sendRejected(...a),
  sendSignupFailedEmail: (...a: unknown[]) => sendFailed(...a),
}));
vi.mock('@/lib/rate-limit', () => ({
  signupLimiter: { check: async () => ({ success: true }) },
  adminPasswordResetLinkLimiter: { check: (...a: unknown[]) => recipientCheck(...a) },
  cleCompte: (email: string) => `h(${email})`,
  getClientIp: () => '127.0.0.1',
  getClientIpBrute: () => '127.0.0.1',
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockImplementation(async () => (key: string) => key),
}));

import { HONEYPOT_FIELD } from '@/lib/honeypot';
import { POST } from '@/app/api/signup/route';

async function signup(email: string, password: string) {
  const res = await POST(
    new Request('http://localhost/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantName: 'Chez Awa', email, password, [HONEYPOT_FIELD]: '' }),
    }),
  );
  return { status: res.status, body: (await res.json()) as unknown };
}

describe('POST /api/signup: aucun oracle d adresses (contre-audit 2)', () => {
  beforeEach(() => {
    existingEmails.clear();
    existingEmails.add('existant@resto.test');
    [sendExists, sendRejected, sendFailed, sendWelcome].forEach((m) =>
      m.mockReset().mockResolvedValue(true),
    );
    recipientCheck.mockReset().mockResolvedValue({ success: true });
  });

  it('les 4 cas (neuve ou existante, mot de passe refuse ou solide) donnent la meme reponse', async () => {
    const neuveRefuse = await signup('neuve@resto.test', PWNED);
    const existanteRefuse = await signup('existant@resto.test', PWNED);
    const existanteSolide = await signup('existant@resto.test', STRONG);
    const neuveSolide = await signup('autre-neuve@resto.test', STRONG);

    expect(neuveRefuse).toEqual(existanteRefuse);
    expect(existanteRefuse).toEqual(existanteSolide);
    expect(existanteSolide).toEqual(neuveSolide);
    expect(neuveRefuse.status).toBe(200);
    expect(JSON.stringify(neuveRefuse.body)).not.toMatch(/mot de passe|password|weak|refus/i);
  });

  it('chaque cas fait UN envoi, sous le meme plafond par destinataire, avec le bon courriel', async () => {
    await signup('neuve@resto.test', PWNED);
    expect(sendRejected).toHaveBeenCalledTimes(1);
    expect(sendRejected.mock.calls[0][0]).toBe('neuve@resto.test');
    expect(sendRejected.mock.calls[0][1]).toEqual({
      signupUrl: expect.stringContaining('/signup'),
    });
    expect(sendExists).not.toHaveBeenCalled();
    expect(recipientCheck).toHaveBeenLastCalledWith('signup-exists:h(neuve@resto.test)');

    await signup('existant@resto.test', PWNED);
    expect(sendExists).toHaveBeenCalledTimes(1);
    expect(recipientCheck).toHaveBeenLastCalledWith('signup-exists:h(existant@resto.test)');
    expect(sendRejected).toHaveBeenCalledTimes(1);
  });

  it('temoin: au-dela du plafond, aucun courriel de refus, et la reponse ne change pas', async () => {
    const avant = await signup('neuve@resto.test', PWNED);
    sendRejected.mockClear();
    recipientCheck.mockResolvedValue({ success: false });
    const apres = await signup('neuve@resto.test', PWNED);

    expect(apres).toEqual(avant);
    expect(sendRejected).not.toHaveBeenCalled();
  });

  it('contre-audit 4: refus de longueur et panne HIBP indiscernables de l adresse existante', async () => {
    const existante = await signup('existant@resto.test', STRONG);
    const tropLongGoTrue = await signup('neuve1@resto.test', GOTRUE_TOO_LONG);
    const panneHibp = await signup('neuve2@resto.test', HIBP_DOWN);

    expect(tropLongGoTrue).toEqual(existante);
    expect(panneHibp).toEqual(existante);
    // Un envoi chacun, sous le meme plafond, avec le bon courriel.
    expect(sendRejected).toHaveBeenCalledWith('neuve1@resto.test', expect.anything());
    expect(sendFailed).toHaveBeenCalledWith('neuve2@resto.test', expect.anything());
    expect(recipientCheck).toHaveBeenCalledWith('signup-exists:h(neuve2@resto.test)');
  });

  it('contre-audit 4: plus de 72 octets, meme refus pour une adresse neuve ou existante', async () => {
    const long = `Aa1!${'x'.repeat(76)}`; // 80 octets
    const neuve = await signup('neuve@resto.test', long);
    const existante = await signup('existant@resto.test', long);

    expect(neuve).toEqual(existante);
    expect(neuve.status).toBe(400);
    expect(neuve.body).toMatchObject({ error: 'PASSWORD_TOO_LONG' });
  });
});
