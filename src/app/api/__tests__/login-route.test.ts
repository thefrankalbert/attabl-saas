import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (before importing the route)
// ---------------------------------------------------------------------------

vi.mock('@/lib/csrf', () => ({ verifyOrigin: vi.fn().mockReturnValue(null) }));
vi.mock('@/lib/rate-limit', () => ({
  loginLimiter: { check: vi.fn().mockResolvedValue({ success: true }) },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock('@/lib/honeypot', () => ({ isHoneypotTriggered: vi.fn().mockReturnValue(false) }));
vi.mock('@/lib/turnstile', () => ({ verifyTurnstileToken: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { POST } from '../login/route';
import { createClient } from '@/lib/supabase/server';

type AdminRow = {
  tenant_id: string;
  is_super_admin: boolean;
  role: string;
  tenants: { slug: string; onboarding_completed: boolean } | null;
};

function mockSupabase(adminUsers: AdminRow[]) {
  return {
    auth: {
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: adminUsers }),
      }),
    }),
  };
}

function buildRequest(): Request {
  return new Request('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify({ email: 'admin@test.com', password: 'password123' }),
  });
}

async function loginWith(adminUsers: AdminRow[]): Promise<{ status: number; redirect?: string }> {
  vi.mocked(createClient).mockResolvedValue(
    mockSupabase(adminUsers) as unknown as Awaited<ReturnType<typeof createClient>>,
  );
  const res = await POST(buildRequest());
  const json = (await res.json()) as { redirect?: string };
  return { status: res.status, redirect: json.redirect };
}

describe('POST /api/login redirect routing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes a platform super-admin to /admin/platform (not onboarding)', async () => {
    // Super-admin is only attached to __platform (onboarding_completed=false).
    const { status, redirect } = await loginWith([
      {
        tenant_id: 'platform',
        is_super_admin: true,
        role: 'owner',
        tenants: { slug: '__platform', onboarding_completed: false },
      },
    ]);
    expect(status).toBe(200);
    expect(redirect).toBe('/admin/platform');
  });

  it('routes a normal owner with a completed tenant to /admin/tenants', async () => {
    const { redirect } = await loginWith([
      {
        tenant_id: 't1',
        is_super_admin: false,
        role: 'owner',
        tenants: { slug: 'resto', onboarding_completed: true },
      },
    ]);
    expect(redirect).toBe('/admin/tenants');
  });

  it('routes a user with an unfinished tenant to /onboarding', async () => {
    const { redirect } = await loginWith([
      {
        tenant_id: 't1',
        is_super_admin: false,
        role: 'owner',
        tenants: { slug: 'resto', onboarding_completed: false },
      },
    ]);
    expect(redirect).toBe('/onboarding');
  });
});
