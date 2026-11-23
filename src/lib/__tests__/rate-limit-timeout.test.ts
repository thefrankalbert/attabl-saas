/**
 * Redis LENT, pas en erreur (audit B20).
 *
 * `@upstash/ratelimit` coupe l'attente a 5 s et RESOUT alors
 * `{ success: true, reason: 'timeout' }` au lieu de lever. Le `catch` de
 * `check()` n'est jamais atteint : un compartiment "fail-closed" (connexion,
 * inscription, code promo...) laissait tout passer pendant une degradation
 * d'Upstash. Ce test utilise la VRAIE bibliotheque ; seul le client Redis est
 * remplace par un client qui ne repond jamais (ou qui leve, pour le temoin).
 * Le test voisin `rate-limit.test.ts` remplace toute la bibliotheque et ne peut
 * pas voir ce cas.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const mode = { v: 'lent' as 'lent' | 'erreur' };

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor() {
      return new Proxy(this, {
        get: (_t, prop) => {
          if (prop === 'then') return undefined;
          if (!String(prop).startsWith('eval')) return () => Promise.resolve(null);
          return () =>
            mode.v === 'lent'
              ? new Promise(() => {}) // ne repond jamais
              : Promise.reject(new Error('upstash injoignable'));
        },
      });
    }
  },
}));

async function charger() {
  vi.resetModules();
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://faux.example');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'faux');
  return import('@/lib/rate-limit');
}

describe('rate-limit: Redis qui ne repond pas (timeout de la bibliotheque)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('temoin: Redis en erreur, un compartiment fail-closed refuse', async () => {
    mode.v = 'erreur';
    const m = await charger();
    expect((await m.loginPaireLimiter.check('cle')).success).toBe(false);
  });

  it('Redis lent: les compartiments fail-closed REFUSENT', async () => {
    mode.v = 'lent';
    const m = await charger();
    const ps = [
      m.loginPaireLimiter.check('cle'),
      m.couponClaimLimiter.check('cle'),
      m.signupLimiter.check('cle'),
    ];
    await vi.advanceTimersByTimeAsync(5001);
    const rs = await Promise.all(ps);
    expect(rs.map((r) => r.success)).toEqual([false, false, false]);
  });

  it('Redis lent: un compartiment fail-open laisse passer, comme sur une erreur', async () => {
    mode.v = 'lent';
    const m = await charger();
    const p = m.orderLimiter.check('cle');
    await vi.advanceTimersByTimeAsync(5001);
    expect((await p).success).toBe(true);
  });
});
