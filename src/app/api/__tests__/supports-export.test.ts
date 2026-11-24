import { describe, it, expect, vi, beforeEach } from 'vitest';

// Contre-audit 3 (verification visuelle, point 8): un 400 de l'export du
// chevalet renvoyait le tableau brut de Zod, en anglais.
const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({
  supportsExportLimiter: { check: async () => ({ success: true }) },
  getClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/csrf', () => ({ verifyOrigin: () => null }));
vi.mock('@/lib/logger', () => ({ logger: { warn, error: vi.fn(), info: vi.fn() } }));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => `errors.${key}`),
}));
vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserWithTenant: vi.fn(async () => {
    throw new Error('ne doit pas etre atteint');
  }),
  AuthError: class extends Error {},
}));

import { POST } from '@/app/api/supports/export/route';

function post(body: string) {
  return POST(
    new Request('http://localhost/api/supports/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }),
  );
}

describe('POST /api/supports/export: refus lisibles', () => {
  beforeEach(() => warn.mockClear());

  it('configuration invalide: message fixe traduit, detail au journal seulement', async () => {
    const res = await post(JSON.stringify({ config: { unit: 'km' } }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ error: 'errors.chevaletConfigInvalid', code: 'INVALID_CONFIG' });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('configuration refusee'),
      expect.objectContaining({ issues: expect.any(Array) }),
    );
  });

  it('corps illisible: message traduit, pas "Invalid JSON"', async () => {
    const res = await post('pas du json{');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'errors.invalidRequestBody', code: 'INVALID_JSON' });
  });
});
