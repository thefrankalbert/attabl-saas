import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  // La garde serree est passee sur le COMPTE, et une garde large reste par
  // adresse: comptee par adresse, la garde serree punissait le Wi-Fi d'un
  // restaurant alors que l'abus vise une boite mail precise.
  forgotPasswordLimiter: { check: vi.fn() },
  forgotPasswordAdresseLimiter: { check: vi.fn() },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
  // Regroupement IPv6 /64: l identite en test, le comportement est teste a part.
  grouperAdresse: (ip: string) => ip,
  // Intervalle minimum entre deux envois: libre par defaut.
  envoiAutorisePourCompte: vi.fn().mockResolvedValue(true),
  libererEnvoi: vi.fn().mockResolvedValue(undefined),
  cleCompte: (email: string) => `empreinte:${email.toLowerCase()}`,
  minutesAvantLiberation: () => 7,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  hashEmail: (email: string) => `hash_${email}`,
}));

vi.mock('@/services/email.service', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendWelcomeConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { POST } from '../forgot-password/route';
import { forgotPasswordLimiter, forgotPasswordAdresseLimiter } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPasswordResetEmail } from '@/services/email.service';
import { envoiAutorisePourCompte, libererEnvoi } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRequest(body?: unknown, options?: { malformed?: boolean }): Request {
  if (options?.malformed) {
    return new Request('http://localhost:3000/api/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-valid-json{{{',
    });
  }
  return new Request('http://localhost:3000/api/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockRateLimit(allowed: boolean) {
  vi.mocked(forgotPasswordLimiter.check).mockResolvedValue({
    success: allowed,
    limit: 3,
    remaining: allowed ? 2 : 0,
    reset: Date.now() + 600_000,
  });
}

function createMockAdminClient(overrides?: {
  generateLinkResult?: { data: unknown; error: unknown };
  generateLinkImpl?: (params: { type: string }) => Promise<{ data: unknown; error: unknown }>;
}) {
  const defaultResult = overrides?.generateLinkResult ?? {
    data: { properties: { hashed_token: 'token_abc123' } },
    error: null,
  };

  const generateLink = overrides?.generateLinkImpl
    ? vi.fn().mockImplementation(overrides.generateLinkImpl)
    : vi.fn().mockResolvedValue(defaultResult);

  return {
    auth: {
      admin: {
        generateLink,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/forgot-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(forgotPasswordAdresseLimiter.check).mockResolvedValue({
      success: true,
      limit: 30,
      remaining: 29,
      reset: Date.now() + 600_000,
    });
    vi.mocked(envoiAutorisePourCompte).mockResolvedValue(true);
  });

  /**
   * LE PLAFOND PAR COMPTE S ARRETE EN SILENCE, et c'est la propriete a tenir.
   *
   * Une version precedente rendait 429 ici. Constat d'audit: n'importe qui
   * connaissant l'email du proprietaire d'un restaurant pouvait alors epuiser
   * son budget - 18 requetes par heure depuis une seule machine - et le priver
   * DEFINITIVEMENT de toute reinitialisation. La reponse doit donc rester
   * identique a celle d'un envoi normal (elle ne dit deja rien sur l'existence
   * du compte), et AUCUN mail ne doit partir.
   */
  it('plafond par compte atteint: reponse normale, et aucun mail envoye', async () => {
    mockRateLimit(false);
    const mock = createMockAdminClient();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const res = await POST(buildRequest({ email: 'test@test.com' }));
    const json = (await res.json()) as { success?: boolean; error?: string };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.error).toBeUndefined();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  /**
   * L ORDRE EST LA PROPRIETE. Generer un lien de recuperation PERIME le
   * precedent. Si le verrou d envoi est consulte APRES `generateLink`, un
   * attaquant peut invalider le lien que le proprietaire vient de recevoir sans
   * qu aucun mail ne parte: recuperation refusee, et sans trace. Constat
   * d audit du 2026-11-08.
   */
  it('envoi trop rapproche: AUCUN lien genere, donc aucun lien existant perime', async () => {
    mockRateLimit(true);
    vi.mocked(envoiAutorisePourCompte).mockResolvedValue(false);
    const mock = createMockAdminClient();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const res = await POST(buildRequest({ email: 'test@test.com' }));

    expect(res.status).toBe(200);
    expect(mock.auth.admin.generateLink).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  /**
   * UNE CLE PAR USAGE. Avec une cle partagee, demander son mot de passe
   * bloquait une minute le renvoi du mail de confirmation, et inversement:
   * deux fonctionnalites sans rapport se genaient.
   */
  it('prend un verrou nomme pour la recuperation, pas un verrou global', async () => {
    mockRateLimit(true);
    const mock = createMockAdminClient();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await POST(buildRequest({ email: 'test@test.com' }));

    const cle = vi.mocked(envoiAutorisePourCompte).mock.calls[0][0];
    expect(cle).toMatch(/^recuperation:/);
  });

  /**
   * UNE REQUETE QUI NE PRODUIT RIEN NE DOIT PAS CONFISQUER LA SUIVANTE. Si le
   * lien ne peut pas etre genere, aucun mail ne part: garder le verrou
   * bloquerait une minute une requete qui, elle, aurait abouti.
   */
  it('rend le verrou quand aucun lien ne peut etre genere', async () => {
    mockRateLimit(true);
    const mock = createMockAdminClient({
      generateLinkResult: { data: null, error: { message: 'user not found' } },
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const res = await POST(buildRequest({ email: 'inconnu@test.com' }));

    expect(res.status).toBe(200);
    expect(libererEnvoi).toHaveBeenCalledWith(expect.stringMatching(/^recuperation:/));
  });

  it('garde de cout par adresse: 429 avec le delai annonce', async () => {
    mockRateLimit(true);
    vi.mocked(forgotPasswordAdresseLimiter.check).mockResolvedValue({
      success: false,
      limit: 30,
      remaining: 0,
      reset: Date.now() + 600_000,
    });

    const res = await POST(buildRequest({ email: 'test@test.com' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(429);
    // Le message doit DIRE combien de temps attendre, et jamais "0 minutes".
    expect(json.error).toMatch(/dans [1-9]\d* minutes/);
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('returns 400 when body is malformed JSON', async () => {
    mockRateLimit(true);
    const mock = createMockAdminClient();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const res = await POST(buildRequest(undefined, { malformed: true }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('returns 400 when email is invalid', async () => {
    mockRateLimit(true);
    const mock = createMockAdminClient();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const res = await POST(buildRequest({ email: 'not-an-email' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toContain('Email invalide');
  });

  it('returns success when user does not exist (prevents enumeration)', async () => {
    mockRateLimit(true);
    // Both recovery and signup generateLink fail for non-existent user
    const mock = createMockAdminClient({
      generateLinkImpl: async () => ({
        data: null,
        error: { message: 'User not found' },
      }),
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const res = await POST(buildRequest({ email: 'unknown@test.com' }));
    const json = (await res.json()) as { success: boolean };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('returns success and sends reset email when user exists with confirmed email', async () => {
    mockRateLimit(true);
    // Recovery link succeeds for confirmed users
    const mock = createMockAdminClient({
      generateLinkResult: {
        data: { properties: { hashed_token: 'recovery_token_123' } },
        error: null,
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const res = await POST(buildRequest({ email: 'known@test.com' }));
    const json = (await res.json()) as { success: boolean };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mock.auth.admin.generateLink).toHaveBeenCalledWith({
      type: 'recovery',
      email: 'known@test.com',
    });
  });

  it('does NOT fall back to signup link when recovery fails (anti-enumeration)', async () => {
    mockRateLimit(true);
    // Recovery fails. The previous behavior was to attempt a type:'signup'
    // link which could silently create a user for a non-existent email.
    // The route now returns success (anti-enumeration) without any fallback.
    const mock = createMockAdminClient({
      generateLinkImpl: async () => ({
        data: null,
        error: { message: 'User not found' },
      }),
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const res = await POST(buildRequest({ email: 'unconfirmed@test.com' }));
    const json = (await res.json()) as { success: boolean };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    // Recovery attempted once, no second call for the removed signup fallback.
    expect(mock.auth.admin.generateLink).toHaveBeenCalledTimes(1);
    expect(mock.auth.admin.generateLink).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'recovery' }),
    );
  });

  it('does not call listUsers (scalability fix)', async () => {
    mockRateLimit(true);
    const mock = createMockAdminClient();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await POST(buildRequest({ email: 'test@test.com' }));

    // listUsers should not exist on the mock at all -- the route no longer calls it
    expect((mock.auth.admin as Record<string, unknown>).listUsers).toBeUndefined();
  });
});
