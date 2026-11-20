import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const validateEnv = vi.fn();
const loggerError = vi.fn();

vi.mock('../lib/env', () => ({ validateEnv }));
vi.mock('../lib/logger', () => ({ logger: { error: loggerError } }));
vi.mock('../../sentry.server.config', () => ({}));
vi.mock('@sentry/nextjs', () => ({ captureRequestError: vi.fn() }));

import { register } from '../instrumentation';

describe('register (demarrage serveur)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('une variable manquante est signalee mais ne fait pas tomber le site', async () => {
    validateEnv.mockImplementation(() => {
      throw new Error('Invalid or missing required environment variables: STRIPE_WEBHOOK_SECRET');
    });

    await expect(register()).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalledWith(
      'Configuration invalide au demarrage du serveur',
      expect.any(Error),
    );
  });

  it('configuration complete: rien a signaler', async () => {
    validateEnv.mockImplementation(() => undefined);

    await register();

    expect(validateEnv).toHaveBeenCalledTimes(1);
    expect(loggerError).not.toHaveBeenCalled();
  });
});
