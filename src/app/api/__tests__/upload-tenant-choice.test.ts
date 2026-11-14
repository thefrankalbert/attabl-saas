/**
 * /api/upload: dans quel dossier d'etablissement le fichier est range.
 * Avant: toujours sous l'etablissement "par defaut" (le plus recent inacheve),
 * meme pendant l'installation d'un autre ou depuis l'espace d'un autre.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Coupure du restaurant (A-02): la garde est simulee ici, ses refus sont testes
// dans tenant-lock-routes.test.ts.
vi.mock('@/lib/billing/tenant-lock-response', () => ({
  tenantLockResponse: vi.fn(async () => null),
}));

const resolve = vi.fn();
const upload = vi.fn();

vi.mock('@/lib/auth/session-admin-user', () => ({
  resolveSessionAdminUser: (...a: unknown[]) => resolve(...a),
}));
vi.mock('@/lib/rate-limit', () => ({
  uploadLimiter: { check: async () => ({ success: true }) },
  getClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/csrf', () => ({ verifyOrigin: () => null }));
const resolveAdminPermission = vi.fn(async () => ({ allowed: true }));
vi.mock('@/lib/auth/resolve-admin-permission', () => ({
  resolveAdminPermission: () => resolveAdminPermission(),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        upload: (...a: unknown[]) => upload(...a),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }),
        remove: async () => ({ error: null }),
      }),
    },
  }),
}));

import { POST } from '../../api/upload/route';

// En-tete PNG valide (octets magiques).
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function req(url: string, headers: Record<string, string> = {}) {
  const f = new FormData();
  f.append('file', new File([PNG], 'logo.png', { type: 'image/png' }));
  f.append('bucket', 'logos');
  return new Request(url, { method: 'POST', body: f, headers });
}

const ok = (tenant: string) => ({
  ok: true,
  userId: 'u1',
  adminUser: { tenant_id: tenant, role: 'owner', tenant_slug: tenant, onboarding_completed: false },
});

beforeEach(() => {
  vi.clearAllMocks();
  upload.mockResolvedValue({ error: null });
});

describe('POST /api/upload - choix de l etablissement', () => {
  it('range le fichier sous l etablissement nomme par ?site=', async () => {
    resolve.mockResolvedValue(ok('tenant-b'));
    const res = await POST(req('http://localhost/api/upload?site=resto-b'));
    expect(res.status).toBe(200);
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ siteSlug: 'resto-b' }));
    expect(upload.mock.calls[0][0]).toMatch(/^tenant-b\//);
  });

  it('ne retombe JAMAIS sur un autre etablissement quand ?site= est refuse', async () => {
    resolve.mockResolvedValue({
      ok: false,
      status: 403,
      error: 'Compte etablissement introuvable',
    });
    const res = await POST(req('http://localhost/api/upload?site=pas-a-moi'));
    expect(res.status).toBe(403);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(upload).not.toHaveBeenCalled();
  });

  it('utilise l etablissement de la page (en-tete du proxy) sans ?site=', async () => {
    resolve.mockResolvedValue(ok('tenant-a'));
    await POST(req('http://localhost/api/upload', { 'x-tenant-slug-hint': 'resto-a' }));
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ siteSlug: 'resto-a' }));
  });

  it('retombe sur le choix par defaut si la page n est pas a l utilisateur', async () => {
    resolve
      .mockResolvedValueOnce({ ok: false, status: 403, error: 'x' })
      .mockResolvedValueOnce(ok('defaut'));
    const res = await POST(req('http://localhost/api/upload', { 'x-tenant-slug-hint': 'autre' }));
    expect(res.status).toBe(200);
    expect(resolve).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ siteSlug: expect.anything() }),
    );
  });

  it('refuse un membre sans la permission (intrusion P-04)', async () => {
    resolve.mockResolvedValue(ok('tenant-a'));
    resolveAdminPermission.mockResolvedValueOnce({ allowed: false });
    const res = await POST(req('http://localhost/api/upload'));
    expect(res.status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
  });

  it('refuse un ?site= mal forme avant toute recherche', async () => {
    const res = await POST(req('http://localhost/api/upload?site=../x'));
    expect(res.status).toBe(400);
    expect(resolve).not.toHaveBeenCalled();
  });
});
