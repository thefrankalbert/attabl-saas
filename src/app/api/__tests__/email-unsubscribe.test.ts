import { describe, it, expect, vi, beforeEach } from 'vitest';

const { check, optOut } = vi.hoisted(() => ({ check: vi.fn(), optOut: vi.fn() }));

vi.mock('@/lib/rate-limit', () => ({ invitationValidateLimiter: { check } }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn().mockReturnValue({}) }));
vi.mock('@/services/email-unsubscribe.service', () => ({
  createEmailUnsubscribeService: () => ({ optOut }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { GET, POST } from '../email/unsubscribe/route';
import { signUnsubscribeToken } from '@/lib/email/unsubscribe-token';

const SUBJECT = {
  adminUserId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
};
const BASE = 'https://attabl.com/api/email/unsubscribe';

function post(
  token: string | null,
  body: string,
  contentType = 'application/x-www-form-urlencoded',
) {
  const url = token === null ? BASE : `${BASE}?token=${encodeURIComponent(token)}`;
  return new Request(url, { method: 'POST', headers: { 'content-type': contentType }, body });
}

describe('POST /api/email/unsubscribe (RFC 8058)', () => {
  let token: string;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'cle-de-test-serveur';
    check.mockResolvedValue({ success: true, limit: 30, remaining: 29, reset: 0 });
    optOut.mockResolvedValue(undefined);
    token = signUnsubscribeToken(SUBJECT);
  });

  it('desinscription en un clic: pose la preference de la personne du jeton', async () => {
    const res = await POST(post(token, 'List-Unsubscribe=One-Click'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(optOut).toHaveBeenCalledWith(SUBJECT);
    expect(check).toHaveBeenCalledWith(expect.stringMatching(/^unsubscribe:[0-9a-f]{64}$/));
  });

  it('accepte aussi le corps multipart permis par la RFC', async () => {
    const form = new FormData();
    form.set('List-Unsubscribe', 'One-Click');
    const res = await POST(new Request(`${BASE}?token=${token}`, { method: 'POST', body: form }));
    expect(res.status).toBe(200);
    expect(optOut).toHaveBeenCalledWith(SUBJECT);
  });

  it('jeton falsifie: meme reponse qu un jeton valide, mais rien n est ecrit', async () => {
    const [payload, sig] = token.split('.');
    const forged = `${payload}.${sig.startsWith('A') ? 'B' : 'A'}${sig.slice(1)}`;
    const res = await POST(post(forged, 'List-Unsubscribe=One-Click'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(optOut).not.toHaveBeenCalled();
  });

  it('Zod: corps absent ou different de One-Click refuse (400), rien n est ecrit', async () => {
    for (const body of ['', 'List-Unsubscribe=Yes', 'foo=bar']) {
      const res = await POST(post(token, body));
      expect(res.status).toBe(400);
    }
    expect(optOut).not.toHaveBeenCalled();
  });

  it('Zod: jeton absent ou mal forme refuse (400) avant tout comptage', async () => {
    expect((await POST(post(null, 'List-Unsubscribe=One-Click'))).status).toBe(400);
    expect((await POST(post('pas un jeton', 'List-Unsubscribe=One-Click'))).status).toBe(400);
    expect(check).not.toHaveBeenCalled();
    expect(optOut).not.toHaveBeenCalled();
  });

  it('limite de debit atteinte: 429, rien n est ecrit', async () => {
    check.mockResolvedValue({ success: false, limit: 30, remaining: 0, reset: 0 });
    const res = await POST(post(token, 'List-Unsubscribe=One-Click'));
    expect(res.status).toBe(429);
    expect(optOut).not.toHaveBeenCalled();
  });

  it('echec base: 500, sans detail interne', async () => {
    optOut.mockRejectedValue(new Error('db down'));
    const res = await POST(post(token, 'List-Unsubscribe=One-Click'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Erreur serveur' });
  });
});

describe('GET /api/email/unsubscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'cle-de-test-serveur';
    check.mockResolvedValue({ success: true, limit: 30, remaining: 29, reset: 0 });
  });

  it('ne desinscrit jamais: redirige vers la page de confirmation', async () => {
    const token = signUnsubscribeToken(SUBJECT);
    const res = await GET(new Request(`${BASE}?token=${encodeURIComponent(token)}`));
    expect(res.status).toBe(303);
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.pathname).toBe('/unsubscribe');
    expect(location.searchParams.get('token')).toBe(token);
    expect(optOut).not.toHaveBeenCalled();
  });

  it('jeton mal forme: 400', async () => {
    expect((await GET(new Request(`${BASE}?token=x`))).status).toBe(400);
  });
});
