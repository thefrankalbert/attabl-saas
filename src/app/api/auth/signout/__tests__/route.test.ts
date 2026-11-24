import { describe, it, expect, vi } from 'vitest';

const signOut = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { signOut } }) }));
vi.mock('@/lib/rate-limit', () => ({
  signoutLimiter: { check: async () => ({ success: true }) },
  getClientIp: () => '1.2.3.4',
}));
vi.mock('@/lib/csrf', () => ({ verifyOrigin: () => null }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { POST } from '../route';

const req = () => new Request('https://demo.attabl.com/api/auth/signout', { method: 'POST' });

describe('POST /api/auth/signout', () => {
  it('revocation reussie: redirige vers /login', async () => {
    signOut.mockResolvedValue({ error: null });
    const res = await POST(req());
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://demo.attabl.com/login');
  });

  it('revocation en echec: ne pretend PAS avoir deconnecte', async () => {
    signOut.mockResolvedValue({ error: new Error('network') });
    const res = await POST(req());
    expect(res.status).toBe(502);
    expect(res.headers.get('location')).toBeNull();
  });

  it('exception: erreur, pas de redirection', async () => {
    signOut.mockImplementation(async () => {
      throw new Error('boom');
    });
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(res.headers.get('location')).toBeNull();
  });
});
