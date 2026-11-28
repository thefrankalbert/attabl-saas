import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

describe('logger production JSON output', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('writes structured JSON for errors', async () => {
    const { logger } = await import('@/lib/logger');

    logger.error('Payment failed', new Error('boom'), {
      orderId: 'ord-1',
      correlationId: 'corr-test-123',
    });

    expect(console.error).toHaveBeenCalled();
    const payload = JSON.parse(
      String((console.error as ReturnType<typeof vi.fn>).mock.calls[0][0]),
    );
    expect(payload.level).toBe('error');
    expect(payload.message).toBe('Payment failed');
    expect(payload.correlationId).toBe('corr-test-123');
    expect(payload.orderId).toBe('ord-1');
  });

  it('K5.3: masque les valeurs secretes a toute profondeur, sans toucher au reste', async () => {
    const { logger } = await import('@/lib/logger');
    const Sentry = await import('@sentry/nextjs');

    logger.error(
      'Upstream failed',
      { status: 401, headers: { Authorization: 'Bearer abc' } },
      {
        orderId: 'ord-1',
        refresh_token: 'rt-secret',
        nested: { apiKey: 'k-1', items: [{ password: 'p' }, { ok: true }] },
      },
    );

    const line = String((console.error as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(line).not.toMatch(/Bearer abc|rt-secret|k-1|"p"/);
    const payload = JSON.parse(line);
    expect(payload.orderId).toBe('ord-1');
    expect(payload.refresh_token).toBe('[masque]');
    expect(payload.nested.apiKey).toBe('[masque]');
    expect(payload.nested.items[1].ok).toBe(true);
    expect(payload.error.status).toBe(401);
    expect(payload.error.headers.Authorization).toBe('[masque]');

    const extra = JSON.stringify((Sentry.captureMessage as ReturnType<typeof vi.fn>).mock.calls[0]);
    expect(extra).not.toMatch(/Bearer abc|rt-secret|k-1/);
  });

  it('K5.3: coupe les cycles au lieu de planter', async () => {
    const { redactSecrets } = await import('@/lib/logger');
    const a: Record<string, unknown> = { name: 'a' };
    a.self = a;
    expect(redactSecrets(a)).toEqual({ name: 'a', self: '[cycle]' });
  });
});
