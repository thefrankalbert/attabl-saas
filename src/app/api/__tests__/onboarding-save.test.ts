import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRateLimitCheck = vi.fn();
const mockSaveStep = vi.fn();
const mockResolveSessionAdminUser = vi.fn();

vi.mock('@/services/storage-cleanup.service', () => ({
  getStorageCleanup: () => ({
    imageUrlsOf: async () => [],
    logoUrlOf: async () => [],
    release: async () => undefined,
    releaseUnreferencedFiles: async () => undefined,
    purgeTenant: async () => undefined,
  }),
}));
vi.mock('@/lib/rate-limit', () => ({
  onboardingSaveLimiter: { check: mockRateLimitCheck },
  getClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/csrf', () => ({ verifyOrigin: () => null }));
vi.mock('@/services/onboarding.service', () => ({
  createOnboardingService: vi.fn(() => ({ saveStep: mockSaveStep })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock('@/lib/auth/session-admin-user', () => ({
  resolveSessionAdminUser: (...args: unknown[]) => mockResolveSessionAdminUser(...args),
}));

function session(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    userId: 'u1',
    adminUser: {
      tenant_id: 't1',
      role: 'owner',
      tenant_slug: 'resto',
      onboarding_completed: false,
      ...over,
    },
  };
}

function post(url = 'http://localhost/api/onboarding/save') {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step: 1, data: { tenantName: 'Ancien nom' } }),
  });
}

describe('POST /api/onboarding/save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimitCheck.mockResolvedValue({ success: true });
    mockResolveSessionAdminUser.mockResolvedValue(session());
    mockSaveStep.mockResolvedValue(undefined);
  });

  it('enregistre le brouillon du restaurant resolu par la session', async () => {
    const { POST } = await import('@/app/api/onboarding/save/route');
    const res = await POST(post());

    expect(res.status).toBe(200);
    expect(mockSaveStep).toHaveBeenCalledWith('t1', 1, expect.any(Object), expect.any(Object));
  });

  it('refuse 409 et n ecrit RIEN sur un restaurant deja lance', async () => {
    // Un onglet d'onboarding reste ouvert (ou la sauvegarde de sortie)
    // reecrivait le nom, l'adresse et les couleurs avec ses vieilles valeurs.
    mockResolveSessionAdminUser.mockResolvedValue(session({ onboarding_completed: true }));
    const { POST } = await import('@/app/api/onboarding/save/route');
    const res = await POST(post());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'ONBOARDING_ALREADY_COMPLETED',
      slug: 'resto',
    });
    expect(mockSaveStep).not.toHaveBeenCalled();
  });

  it('refuse 403 a un non proprietaire', async () => {
    mockResolveSessionAdminUser.mockResolvedValue(session({ role: 'waiter' }));
    const { POST } = await import('@/app/api/onboarding/save/route');
    const res = await POST(post());

    expect(res.status).toBe(403);
    expect(mockSaveStep).not.toHaveBeenCalled();
  });

  it('transmet ?site= au resolveur, restreint aux proprietaires', async () => {
    const { POST } = await import('@/app/api/onboarding/save/route');
    await POST(post('http://localhost/api/onboarding/save?site=resto-b'));

    expect(mockResolveSessionAdminUser).toHaveBeenCalledWith(
      expect.objectContaining({ siteSlug: 'resto-b', ownerOnly: true }),
    );
  });

  it('rend 500 quand le brouillon ne peut pas etre enregistre', async () => {
    // Le service leve desormais: l'ecran n'affiche plus "enregistre" a tort.
    const { ServiceError } = await import('@/services/errors');
    mockSaveStep.mockRejectedValue(new ServiceError('Failed to save onboarding draft', 'INTERNAL'));
    const { POST } = await import('@/app/api/onboarding/save/route');
    const res = await POST(post());

    expect(res.status).toBe(500);
  });
});
