import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

type Breaker = typeof import('../circuit-breaker');

function stripeError(statusCode: number): Error {
  return Object.assign(new Error(`stripe ${statusCode}`), { statusCode });
}

async function failTimes(breaker: Breaker, times: number, error: Error): Promise<void> {
  for (let i = 0; i < times; i++) {
    await expect(breaker.withStripeBreaker(() => Promise.reject(error))).rejects.toBe(error);
  }
}

describe('withStripeBreaker', () => {
  let breaker: Breaker;

  beforeEach(async () => {
    // Le disjoncteur est un singleton de module: un module neuf par test.
    vi.resetModules();
    breaker = await import('../circuit-breaker');
  });

  it('ne s ouvre pas sur des erreurs client (404, carte refusee)', async () => {
    await failTimes(breaker, 5, stripeError(404));
    await failTimes(breaker, 5, stripeError(402));
    await expect(breaker.withStripeBreaker(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('s ouvre apres trois pannes (5xx) et refuse l appel suivant', async () => {
    await failTimes(breaker, 3, stripeError(503));
    await expect(breaker.withStripeBreaker(() => Promise.resolve('ok'))).rejects.toThrow(/OPEN/);
  });

  it('compte le 429 et les erreurs reseau comme des pannes', async () => {
    await failTimes(breaker, 2, stripeError(429));
    await failTimes(breaker, 1, new Error('ECONNRESET'));
    await expect(breaker.withStripeBreaker(() => Promise.resolve('ok'))).rejects.toThrow(/OPEN/);
  });

  it('une erreur client remet le compteur de pannes a zero', async () => {
    await failTimes(breaker, 2, stripeError(503));
    await failTimes(breaker, 1, stripeError(404));
    await failTimes(breaker, 2, stripeError(503));
    await expect(breaker.withStripeBreaker(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('n oublie aucune minuterie apres un appel', async () => {
    vi.useFakeTimers();
    try {
      await breaker.withStripeBreaker(() => Promise.resolve('ok'));
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
