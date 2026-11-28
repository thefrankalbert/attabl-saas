import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit d'equipe du 2026-11-27: un super administrateur non membre du
// restaurant ne vide le cache de sa carte qu'avec une session aal2.

const { mockGetClaims, mockFrom, mockRevalidateTag } = vi.hoisted(() => ({
  mockGetClaims: vi.fn(),
  mockFrom: vi.fn(),
  mockRevalidateTag: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidateTag: mockRevalidateTag, revalidatePath: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({
  revalidateMenuLimiter: { check: vi.fn(() => Promise.resolve({ success: true })) },
  getClientIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/csrf', () => ({ verifyOrigin: vi.fn(() => null) }));
vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUser: vi.fn(async () => ({
    user: { id: 'super-1' },
    supabase: { auth: { getClaims: mockGetClaims }, from: mockFrom },
  })),
  AuthError: class AuthError extends Error {},
}));

import { POST } from '@/app/api/revalidate-menu/route';

function chain(data: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'or', 'limit']) c[m] = vi.fn(() => c);
  c.maybeSingle = vi.fn(() => Promise.resolve({ data, error: null }));
  return c;
}

function req(): Request {
  return new Request('http://localhost/api/revalidate-menu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: 'client-b' }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Restaurant client-b; la seule ligne de l'appelant est sa ligne de super
  // administrateur sur un AUTRE restaurant.
  mockFrom.mockImplementation((t: string) =>
    t === 'tenants'
      ? chain({ id: 'tenant-b' })
      : chain({ tenant_id: 'tenant-plateforme', is_super_admin: true, role: 'owner' }),
  );
});

describe('POST /api/revalidate-menu - super administrateur non membre', () => {
  it('refuse en session aal1 (mot de passe seul)', async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { aal: 'aal1' } }, error: null });
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it('accepte en session aal2 (temoin positif)', async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { aal: 'aal2' } }, error: null });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mockRevalidateTag).toHaveBeenCalled();
  });
});
