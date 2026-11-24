import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { check, unsubscribe, resubscribe, verifyOrigin } = vi.hoisted(() => ({
  check: vi.fn(),
  unsubscribe: vi.fn(),
  resubscribe: vi.fn(),
  verifyOrigin: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', async () => {
  const { createHash } = await import('node:crypto');
  return {
    invitationValidateLimiter: { check },
    getClientIp: () => '203.0.113.7',
    // Meme calcul que le vrai `cleCompte` (empreinte, jamais l'adresse).
    cleCompte: (email: string) =>
      createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 32),
  };
});
vi.mock('@/lib/csrf', () => ({ verifyOrigin }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/services/email-unsubscribe.service', () => ({
  createEmailUnsubscribeService: () => ({ unsubscribe, resubscribe }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { GET, POST } from '../email/unsubscribe/route';
import { createUnsubscribeToken } from '@/lib/email-unsubscribe-token';

const SECRET = 'un-secret-de-test-suffisamment-long-0123456789';
const ORIGINAL = process.env.EMAIL_UNSUBSCRIBE_SECRET;
const BASE = 'https://attabl.com/api/email/unsubscribe';

function oneClick(token: string, body = 'List-Unsubscribe=One-Click'): Request {
  return new Request(`${BASE}?t=${token}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
}

function fromPage(body: unknown): Request {
  return new Request(BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://attabl.com' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = SECRET;
  check.mockReset().mockResolvedValue({ success: true });
  unsubscribe.mockReset().mockResolvedValue(undefined);
  resubscribe.mockReset().mockResolvedValue(undefined);
  verifyOrigin.mockReset().mockReturnValue(null);
});
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
  else process.env.EMAIL_UNSUBSCRIBE_SECRET = ORIGINAL;
});

describe('POST /api/email/unsubscribe', () => {
  it('un clic (RFC 8058): desabonne l adresse du jeton, normalisee', async () => {
    const res = await POST(oneClick(createUnsubscribeToken(' Patron@Resto.TEST')!));
    expect(res.status).toBe(200);
    expect(unsubscribe).toHaveBeenCalledWith('patron@resto.test');
    expect(verifyOrigin).not.toHaveBeenCalled();
  });

  it('limite de debit: jeton valide compte PAR ADRESSE (empreinte), jamais en clair', async () => {
    check.mockResolvedValue({ success: false });
    const res = await POST(oneClick(createUnsubscribeToken('a@b.test')!));
    expect(res.status).toBe(429);
    const key = check.mock.calls[0][0] as string;
    expect(key).toMatch(/^unsubscribe:[0-9a-f]{32}$/);
    expect(key).not.toContain('a@b.test');
    expect(key).not.toContain('203.0.113.7');
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('limite de debit: jeton invalide, corps invalide ou origine refusee comptes par IP', async () => {
    check.mockResolvedValue({ success: false });
    expect((await POST(oneClick('jeton-faux'))).status).toBe(429);
    expect((await POST(oneClick(createUnsubscribeToken('a@b.test')!, 'autre=1'))).status).toBe(429);
    verifyOrigin.mockReturnValue(new Response(null, { status: 403 }));
    expect((await POST(fromPage({ token: 'x', action: 'unsubscribe' }))).status).toBe(429);
    expect(check.mock.calls.map((c) => c[0])).toEqual([
      'unsubscribe-invalid:203.0.113.7',
      'unsubscribe-invalid:203.0.113.7',
      'unsubscribe-invalid:203.0.113.7',
    ]);
  });

  it('CGNAT: le trafic d autres adresses sur la meme IP ne bloque pas un desabonnement valide', async () => {
    // Faux limiteur a compteur par cle: 3 requetes par cle, comme un vrai.
    const counts = new Map<string, number>();
    check.mockImplementation(async (k: string) => {
      counts.set(k, (counts.get(k) ?? 0) + 1);
      return { success: (counts.get(k) ?? 0) <= 3 };
    });
    // Meme IP: 10 desabonnements d'autres adresses et 10 jetons invalides.
    for (let i = 0; i < 10; i++) {
      await POST(oneClick(createUnsubscribeToken(`voisin${i}@resto.test`)!));
      await POST(oneClick('jeton-faux'));
    }
    expect((await POST(oneClick('jeton-faux'))).status).toBe(429);
    const res = await POST(oneClick(createUnsubscribeToken('moi@resto.test')!));
    expect(res.status).toBe(200);
    expect(unsubscribe).toHaveBeenLastCalledWith('moi@resto.test');
  });

  it('pas d oracle: reponse identique pour une adresse connue ou inconnue d ATTABL', async () => {
    const connue = await POST(oneClick(createUnsubscribeToken('patron@resto.test')!));
    const inconnue = await POST(oneClick(createUnsubscribeToken('personne@nulle-part.test')!));
    expect(inconnue.status).toBe(connue.status);
    expect(await inconnue.json()).toEqual(await connue.json());
  });

  it('jeton falsifie, tronque ou d un autre secret: 400, aucune ecriture', async () => {
    const token = createUnsubscribeToken('patron@resto.test')!;
    const falsifie = token.slice(0, 20) + (token[20] === 'A' ? 'B' : 'A') + token.slice(21);
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'un-autre-secret-de-test-tout-aussi-long-987654';
    const autre = createUnsubscribeToken('victime@resto.test')!;
    process.env.EMAIL_UNSUBSCRIBE_SECRET = SECRET;
    for (const bad of [falsifie, token.slice(0, 30), autre, '']) {
      const res = await POST(oneClick(bad));
      expect(res.status).toBe(400);
    }
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('un clic sans le corps List-Unsubscribe=One-Click: refuse', async () => {
    const res = await POST(oneClick(createUnsubscribeToken('a@b.test')!, 'autre=1'));
    expect(res.status).toBe(400);
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('page: desabonnement puis reabonnement, idempotents', async () => {
    const token = createUnsubscribeToken('patron@resto.test')!;
    expect((await POST(fromPage({ token, action: 'unsubscribe' }))).status).toBe(200);
    expect((await POST(fromPage({ token, action: 'unsubscribe' }))).status).toBe(200);
    expect((await POST(fromPage({ token, action: 'resubscribe' }))).status).toBe(200);
    expect(unsubscribe).toHaveBeenCalledTimes(2);
    expect(resubscribe).toHaveBeenCalledWith('patron@resto.test');
  });

  it('page: origine refusee = 403; corps invalide = 400', async () => {
    const token = createUnsubscribeToken('patron@resto.test')!;
    verifyOrigin.mockReturnValue(new Response(null, { status: 403 }));
    expect((await POST(fromPage({ token, action: 'resubscribe' }))).status).toBe(403);
    verifyOrigin.mockReturnValue(null);
    expect((await POST(fromPage({ token, action: 'supprimer' }))).status).toBe(400);
    expect((await POST(fromPage({ token, action: 'unsubscribe', email: 'x@y.z' }))).status).toBe(
      400,
    );
    expect(resubscribe).not.toHaveBeenCalled();
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('secret absent: aucun jeton accepte', async () => {
    const token = createUnsubscribeToken('patron@resto.test')!;
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    expect((await POST(oneClick(token))).status).toBe(400);
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('erreur de base: 500 sans detail', async () => {
    unsubscribe.mockRejectedValue(new Error('db down'));
    const res = await POST(oneClick(createUnsubscribeToken('a@b.test')!));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'server_error' });
  });
});

describe('GET /api/email/unsubscribe', () => {
  it('ne modifie rien et renvoie vers la page de confirmation', async () => {
    const token = createUnsubscribeToken('a@b.test')!;
    const res = await GET(new Request(`${BASE}?t=${token}`));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`https://attabl.com/unsubscribe?t=${token}`);
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('jeton de forme invalide: page sans jeton', async () => {
    const res = await GET(new Request(`${BASE}?t=%3Cscript%3E`));
    expect(res.headers.get('location')).toBe('https://attabl.com/unsubscribe');
  });
});
