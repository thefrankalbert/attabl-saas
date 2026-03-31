import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  stockAlertLimiter: { check: vi.fn() },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

vi.mock('@/lib/plans/features', () => ({
  canAccessFeature: vi.fn(),
}));

vi.mock('@/services/notification.service', () => ({
  checkAndNotifyLowStock: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { POST } from '../stock-alerts/check/route';
import { stockAlertLimiter } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { canAccessFeature } from '@/lib/plans/features';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRequest(): Request {
  return new Request('http://localhost:3000/api/stock-alerts/check', { method: 'POST' });
}

function mockRateLimit(allowed: boolean) {
  vi.mocked(stockAlertLimiter.check).mockResolvedValue({
    success: allowed,
    limit: 10,
    remaining: allowed ? 9 : 0,
    reset: Date.now() + 60_000,
  });
}

function createMockSupabase(overrides?: {
  authUser?: { id: string } | null;
  tenant?: {
    id: string;
    subscription_plan: string;
    subscription_status: string;
    trial_ends_at: string | null;
  } | null;
  tenantError?: { message: string } | null;
  adminUser?: { role: string } | null;
}) {
  const user = overrides?.authUser ?? { id: 'user-1' };
  const tenant = overrides?.tenant ?? {
    id: 'tenant-1',
    subscription_plan: 'premium',
    subscription_status: 'active',
    trial_ends_at: null,
  };
  const tenantError = overrides?.tenantError ?? null;
  const adminUser = overrides?.adminUser ?? { role: 'admin' };

  const makeSingleChain = (data: unknown, error?: unknown) => {
    const result = { data, error: error ?? (data ? null : { message: 'Not found' }) };
    const chain = (): Record<string, ReturnType<typeof vi.fn>> => {
      const c: Record<string, ReturnType<typeof vi.fn>> = {};
      c.single = vi.fn().mockResolvedValue(result);
      c.eq = vi.fn().mockImplementation(() => c);
      c.in = vi.fn().mockImplementation(() => c);
      c.neq = vi.fn().mockImplementation(() => c);
      return c;
    };
    return { select: vi.fn().mockImplementation(() => chain()) };
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: null,
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'tenants') return makeSingleChain(tenant, tenantError);
      if (table === 'admin_users') return makeSingleChain(adminUser);
      return makeSingleChain(null);
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/stock-alerts/check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(headers).mockResolvedValue(
      new Headers({ 'x-tenant-slug': 'my-restaurant' }) as never,
    );
  });

  it('returns 429 when rate limited', async () => {
    mockRateLimit(false);

    const res = await POST(buildRequest());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(429);
    expect(json.error).toContain('Trop de requ');
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase({ authUser: null });
    mock.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const res = await POST(buildRequest());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(401);
    expect(json.error).toContain('Non autoris');
  });

  it('returns 400 when x-tenant-slug header is missing', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase();
    vi.mocked(createClient).mockResolvedValue(mock as never);
    vi.mocked(headers).mockResolvedValue(new Headers() as never);

    const res = await POST(buildRequest());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toContain('Tenant non identifi');
  });

  it('returns 404 when tenant is not found', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase({ tenant: null, tenantError: { message: 'Not found' } });
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const res = await POST(buildRequest());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(404);
    expect(json.error).toContain('Tenant non trouv');
  });

  it('returns skipped when feature is not available', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase();
    vi.mocked(createClient).mockResolvedValue(mock as never);
    vi.mocked(canAccessFeature).mockReturnValue(false);

    const res = await POST(buildRequest());
    const json = (await res.json()) as { skipped: boolean; reason: string };

    expect(res.status).toBe(200);
    expect(json.skipped).toBe(true);
    expect(json.reason).toBe('feature_not_available');
  });

  it('returns success when stock check is triggered', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase();
    vi.mocked(createClient).mockResolvedValue(mock as never);
    vi.mocked(canAccessFeature).mockReturnValue(true);

    const res = await POST(buildRequest());
    const json = (await res.json()) as { success: boolean };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });
});
