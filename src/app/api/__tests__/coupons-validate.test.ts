import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  orderLimiter: { check: vi.fn() },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

vi.mock('@/services/coupon.service', () => ({
  createCouponService: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => {
    const map: Record<string, string> = {
      rateLimited: 'Trop de requetes',
      tenantNotIdentified: 'Tenant non identifie',
      tenantNotFound: 'Tenant non trouve',
      invalidRequestBody: 'Corps de requete invalide',
      invalidData: 'Donnees invalides',
      validationError: 'Erreur de validation',
    };
    return map[key] || key;
  }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { POST } from '../coupons/validate/route';
import { orderLimiter } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { headers } from 'next/headers';
import { createCouponService } from '@/services/coupon.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRequest(body?: unknown, options?: { malformed?: boolean }): Request {
  if (options?.malformed) {
    return new Request('http://localhost:3000/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-valid-json{{{',
    });
  }
  return new Request('http://localhost:3000/api/coupons/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockRateLimit(allowed: boolean) {
  vi.mocked(orderLimiter.check).mockResolvedValue({
    success: allowed,
    limit: 20,
    remaining: allowed ? 19 : 0,
    reset: Date.now() + 60_000,
  });
}

function createMockSupabase(overrides?: {
  tenant?: { id: string } | null;
  tenantError?: { message: string } | null;
}) {
  const tenant = overrides?.tenant ?? { id: 'tenant-1' };
  const tenantError = overrides?.tenantError ?? null;

  const tenantSingle = vi.fn().mockResolvedValue({ data: tenant, error: tenantError });
  const tenantEq = vi.fn().mockReturnValue({ single: tenantSingle });
  const tenantSelect = vi.fn().mockReturnValue({ eq: tenantEq });

  return {
    from: vi.fn().mockReturnValue({ select: tenantSelect }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/coupons/validate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(headers).mockResolvedValue(
      new Headers({ 'x-tenant-slug': 'my-restaurant' }) as never,
    );
  });

  it('returns 429 when rate limited', async () => {
    mockRateLimit(false);

    const res = await POST(buildRequest({ code: 'SAVE10', subtotal: 5000 }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(429);
    expect(json.error).toContain('Trop de requ');
  });

  it('returns 400 with masked error when x-tenant-slug header is missing and no body fallback', async () => {
    mockRateLimit(true);
    vi.mocked(headers).mockResolvedValue(new Headers() as never);

    // No tenantSlug in body either - should fall through to masked error
    const res = await POST(buildRequest({ code: 'SAVE10', subtotal: 5000 }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    // Internal "Tenant non identifie" is masked as a generic invalid-code message
    // so we don't leak architecture details to end users.
    expect(json.error).toBe('Code promo invalide');
  });

  it('returns 404 with masked error when tenant is not found', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase({ tenant: null, tenantError: { message: 'Not found' } });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const res = await POST(buildRequest({ code: 'SAVE10', subtotal: 5000 }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(404);
    // "Tenant non trouve" is masked as a generic invalid-code message.
    expect(json.error).toBe('Code promo invalide');
  });

  it('returns 400 when body is malformed JSON', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const res = await POST(buildRequest(undefined, { malformed: true }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('returns 400 when code is missing', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const res = await POST(buildRequest({ subtotal: 5000 }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('returns coupon validation result on success', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);
    vi.mocked(createCouponService).mockReturnValue({
      validateCoupon: vi.fn().mockResolvedValue({
        valid: true,
        discount: 500,
        discountType: 'fixed',
      }),
    } as never);

    const res = await POST(buildRequest({ code: 'SAVE10', subtotal: 5000 }));
    const json = (await res.json()) as { valid: boolean; discount: number };

    expect(res.status).toBe(200);
    expect(json.valid).toBe(true);
    expect(json.discount).toBe(500);
  });
});
