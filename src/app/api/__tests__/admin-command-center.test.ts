import { describe, it, expect, vi, beforeEach } from 'vitest';

// Revue L017 (A19): les chiffres de la console plateforme passent par une route
// serveur reservee au super administrateur (service_role APRES
// requireSuperAdmin). Un non super administrateur est refuse AVANT toute
// lecture avec le client service_role.

const { mockRequire, mockAdmin, mockOverview, mockChart, mockLimit } = vi.hoisted(() => ({
  mockRequire: vi.fn(),
  mockAdmin: vi.fn(() => ({ admin: true })),
  mockOverview: vi.fn(),
  mockChart: vi.fn(),
  mockLimit: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/csrf', () => ({ verifyOrigin: vi.fn(() => null) }));
vi.mock('@/lib/rate-limit', () => ({
  commandCenterLimiter: { check: mockLimit },
  getClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mockAdmin }));
vi.mock('@/lib/auth/get-session', () => {
  class AuthError extends Error {
    constructor(
      message: string,
      public readonly status: number,
    ) {
      super(message);
    }
  }
  return { AuthError };
});
vi.mock('@/lib/auth/require-super-admin', () => ({ requireSuperAdmin: mockRequire }));
vi.mock('@/services/command-center.service', () => ({
  createCommandCenterService: () => ({ loadOverview: mockOverview, loadChart: mockChart }),
}));

import { POST } from '@/app/api/admin/command-center/route';
import { AuthError } from '@/lib/auth/get-session';

const TENANT = '22222222-2222-4222-a222-222222222222';

function req(body: unknown): Request {
  return new Request('http://localhost/api/admin/command-center', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
const overview = {
  kind: 'overview',
  tenantIds: [TENANT],
  todayStart: today.toISOString(),
  yesterdayStart: yesterday.toISOString(),
};

describe('POST /api/admin/command-center', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue({ success: true });
    mockOverview.mockResolvedValue({ todayPayments: [] });
  });

  it('refuse un non super administrateur (403), sans client service_role ni lecture', async () => {
    mockRequire.mockRejectedValue(new AuthError('Acces reserve au super administrateur', 403));
    const res = await POST(req(overview));
    expect(res.status).toBe(403);
    expect(mockAdmin).not.toHaveBeenCalled();
    expect(mockOverview).not.toHaveBeenCalled();
  });

  it('refuse une session absente (401)', async () => {
    mockRequire.mockRejectedValue(new AuthError('Non authentifie', 401));
    expect((await POST(req(overview))).status).toBe(401);
    expect(mockAdmin).not.toHaveBeenCalled();
  });

  it('super administrateur: lit avec le client service_role, borne aux restaurants demandes', async () => {
    mockRequire.mockResolvedValue({ user: { id: 'sa' } });
    const res = await POST(req(overview));
    expect(res.status).toBe(200);
    expect(mockAdmin).toHaveBeenCalledTimes(1);
    expect(mockOverview).toHaveBeenCalledWith(
      [TENANT],
      overview.todayStart,
      overview.yesterdayStart,
    );
    expect(await res.json()).toEqual({ data: { todayPayments: [] } });
  });

  it('limite de debit: 429 avant toute authentification', async () => {
    mockLimit.mockResolvedValue({ success: false });
    expect((await POST(req(overview))).status).toBe(429);
    expect(mockRequire).not.toHaveBeenCalled();
  });

  it('corps invalide (identifiant non UUID, fenetre trop ancienne): 400', async () => {
    mockRequire.mockResolvedValue({ user: { id: 'sa' } });
    expect((await POST(req({ ...overview, tenantIds: ['x'] }))).status).toBe(400);
    expect(
      (await POST(req({ kind: 'chart', tenantIds: [TENANT], start: '2020-01-01T00:00:00Z' })))
        .status,
    ).toBe(400);
    expect(mockRequire).not.toHaveBeenCalled();
  });
});
