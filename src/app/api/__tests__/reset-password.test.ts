import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * A-06: le serveur change le mot de passe seulement pour une session de
 * recuperation (marqueur httpOnly) ET quand l'adresse du compte est retapee.
 */

const getUser = vi.fn();
const updateUser = vi.fn();
const signOut = vi.fn();
const cookieGet = vi.fn();
const cookieDelete = vi.fn();
const limiterCheck = vi.fn();

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/csrf', () => ({ verifyOrigin: () => null }));
vi.mock('@/lib/rate-limit', () => ({
  forgotPasswordAdresseLimiter: { check: (...a: unknown[]) => limiterCheck(...a) },
  getClientIp: () => '203.0.113.7',
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (...a: unknown[]) => cookieGet(...a),
    delete: (...a: unknown[]) => cookieDelete(...a),
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: (...a: unknown[]) => getUser(...a),
      updateUser: (...a: unknown[]) => updateUser(...a),
      signOut: (...a: unknown[]) => signOut(...a),
    },
  }),
}));

import { POST } from '../reset-password/route';
import { signRecoveryMarker, RECOVERY_MARKER_COOKIE } from '@/lib/auth/recovery-marker';

const ORIGINAL = process.env.SUPABASE_SERVICE_ROLE_KEY;

function req(body: unknown): Request {
  return new Request('http://localhost/api/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const VALID = { accountEmail: 'titulaire@resto.test', password: 'MotDePasse-Solide-1' };

describe('POST /api/reset-password (A-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-secret-key';
    limiterCheck.mockResolvedValue({ success: true });
    getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'titulaire@resto.test' } } });
    updateUser.mockResolvedValue({ error: null });
    cookieGet.mockImplementation((name: string) =>
      name === RECOVERY_MARKER_COOKIE ? { value: signRecoveryMarker('u-1') } : undefined,
    );
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL;
  });

  it('change le mot de passe pour une session de recuperation avec la bonne adresse', async () => {
    const res = await POST(req({ ...VALID, accountEmail: ' Titulaire@Resto.test ' }));

    expect(res.status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith({ password: VALID.password });
    expect(cookieDelete).toHaveBeenCalledWith(RECOVERY_MARKER_COOKIE);
  });

  it('refuse une mauvaise adresse: deconnexion locale, marqueur efface, rien ne change', async () => {
    const res = await POST(req({ ...VALID, accountEmail: 'victime@autre.test' }));

    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe('EMAIL_MISMATCH');
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(updateUser).not.toHaveBeenCalled();
    expect(cookieDelete).toHaveBeenCalledWith(RECOVERY_MARKER_COOKIE);
  });

  it('refuse une session ordinaire sans marqueur de recuperation', async () => {
    cookieGet.mockReturnValue(undefined);

    const res = await POST(req(VALID));

    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe('NO_RECOVERY');
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('refuse un marqueur qui appartient a un autre compte', async () => {
    cookieGet.mockReturnValue({ value: signRecoveryMarker('autre-compte') });

    const res = await POST(req(VALID));

    expect(res.status).toBe(403);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('refuse sans session (401)', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(req(VALID));

    expect(res.status).toBe(401);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('refuse un corps invalide et respecte la limite de debit', async () => {
    expect((await POST(req({ accountEmail: 'x' }))).status).toBe(400);
    limiterCheck.mockResolvedValue({ success: false });
    expect((await POST(req(VALID))).status).toBe(429);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('signale un mot de passe identique a l ancien', async () => {
    updateUser.mockResolvedValue({ error: { code: 'same_password', message: 'same' } });

    const res = await POST(req(VALID));

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('SAME_PASSWORD');
  });
});
