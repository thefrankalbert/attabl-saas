import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('verifyTurnstileToken', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when TURNSTILE_SECRET_KEY is not set (dev mode)', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    const { verifyTurnstileToken } = await import('@/lib/turnstile');
    expect(await verifyTurnstileToken('any-token')).toBe(true);
  });

  it('returns true when Cloudflare responds success: true', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      }),
    );
    const { verifyTurnstileToken } = await import('@/lib/turnstile');
    expect(await verifyTurnstileToken('valid-token')).toBe(true);
  });

  it('returns false when Cloudflare responds success: false', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: false }),
      }),
    );
    const { verifyTurnstileToken } = await import('@/lib/turnstile');
    expect(await verifyTurnstileToken('bad-token')).toBe(false);
  });

  it('returns false when Cloudflare API returns non-ok status', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ success: false }),
      }),
    );
    const { verifyTurnstileToken } = await import('@/lib/turnstile');
    expect(await verifyTurnstileToken('token')).toBe(false);
  });

  it('returns false when fetch throws (network error)', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const { verifyTurnstileToken } = await import('@/lib/turnstile');
    expect(await verifyTurnstileToken('token')).toBe(false);
  });

  it('passes IP to Cloudflare when provided', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal('fetch', mockFetch);
    const { verifyTurnstileToken } = await import('@/lib/turnstile');
    await verifyTurnstileToken('token', '1.2.3.4');
    const body = mockFetch.mock.calls[0][1].body as URLSearchParams;
    expect(body.get('remoteip')).toBe('1.2.3.4');
  });
});
