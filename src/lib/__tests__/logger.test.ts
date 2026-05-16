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
});
