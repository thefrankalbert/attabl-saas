/**
 * Tests du module de limitation de debit.
 *
 * L'enjeu n'est pas le comptage - Upstash s'en charge - mais le COMPORTEMENT EN
 * PANNE. Quand Redis tombe, chaque compartiment choisit entre laisser passer et
 * refuser, et ce choix n'est jamais neutre: refuser la creation de commande
 * ferme la caisse de tous les restaurants a la fois, laisser passer la connexion
 * ouvre le brute-force. Le tableau de la fin fige ce choix compartiment par
 * compartiment: c'est le seul endroit ou une inversion se voit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

/** Pilote le resultat de `limit()` pour tous les limiteurs d'un test. */
const upstash = { shouldThrow: false, success: true };

vi.mock('@upstash/redis', () => ({
  Redis: class {},
}));

vi.mock('@upstash/ratelimit', () => {
  class FakeRatelimit {
    async limit() {
      if (upstash.shouldThrow) throw new Error('upstash injoignable');
      return { success: upstash.success, limit: 10, remaining: 9, reset: 0 };
    }
    static slidingWindow() {
      return { kind: 'slidingWindow' };
    }
    static fixedWindow() {
      return { kind: 'fixedWindow' };
    }
  }
  return { Ratelimit: FakeRatelimit };
});

/**
 * Recharge le module avec Redis configure. Obligatoire: le client Redis et les
 * 28 limiteurs sont construits a l'import, pas a l'appel - sans reset, le
 * premier test figerait l'environnement de tous les autres.
 */
async function loadWithRedis() {
  vi.resetModules();
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://exemple.upstash.io');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'jeton-de-test');
  return import('../rate-limit');
}

async function loadWithoutRedis(nodeEnv: string) {
  vi.resetModules();
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
  vi.stubEnv('NODE_ENV', nodeEnv);
  return import('../rate-limit');
}

beforeEach(() => {
  upstash.shouldThrow = false;
  upstash.success = true;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getClientIp', () => {
  function requestWith(headers: Record<string, string>): Request {
    return new Request('https://exemple.test/api/orders', { headers });
  }

  it('prend la premiere adresse de x-forwarded-for', async () => {
    // La chaine est "client, proxy1, proxy2": seule la premiere est le client.
    const { getClientIp } = await loadWithRedis();
    expect(getClientIp(requestWith({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe(
      '203.0.113.7',
    );
  });

  it('coupe les espaces autour de l adresse', async () => {
    const { getClientIp } = await loadWithRedis();
    expect(getClientIp(requestWith({ 'x-forwarded-for': '  203.0.113.7  , 10.0.0.1' }))).toBe(
      '203.0.113.7',
    );
  });

  it('retombe sur x-real-ip quand x-forwarded-for manque', async () => {
    const { getClientIp } = await loadWithRedis();
    expect(getClientIp(requestWith({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
  });

  it('renvoie anonymous sans aucun en-tete', async () => {
    // Toutes les requetes sans en-tete partagent alors le meme compartiment.
    // C'est voulu: mieux vaut un seau commun qu'aucune limite.
    const { getClientIp } = await loadWithRedis();
    expect(getClientIp(requestWith({}))).toBe('anonymous');
  });
});

describe('getClientIpFromHeaders', () => {
  it('applique la meme regle que getClientIp', async () => {
    const { getClientIpFromHeaders } = await loadWithRedis();
    const h = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });
    expect(getClientIpFromHeaders(h)).toBe('203.0.113.7');
  });

  it('retombe sur x-real-ip puis anonymous', async () => {
    const { getClientIpFromHeaders } = await loadWithRedis();
    expect(getClientIpFromHeaders(new Headers({ 'x-real-ip': '198.51.100.4' }))).toBe(
      '198.51.100.4',
    );
    expect(getClientIpFromHeaders(new Headers())).toBe('anonymous');
  });
});

describe('check() avec Redis joignable', () => {
  it('laisse passer sous la limite', async () => {
    const { orderLimiter } = await loadWithRedis();
    const r = await orderLimiter.check('1.2.3.4:resto');
    expect(r.success).toBe(true);
    expect(r.limit).toBe(10);
  });

  it('refuse au dela de la limite', async () => {
    upstash.success = false;
    const { orderLimiter } = await loadWithRedis();
    expect((await orderLimiter.check('1.2.3.4:resto')).success).toBe(false);
  });
});

describe('check() sans Redis configure', () => {
  it('laisse passer hors production', async () => {
    // Sinon aucun test ni aucun dev local ne pourrait passer une commande.
    const { orderLimiter } = await loadWithoutRedis('development');
    expect((await orderLimiter.check('1.2.3.4')).success).toBe(true);
  });

  it('REFUSE en production', async () => {
    // Une prod sans Redis est une prod sans protection: on bloque plutot que
    // d'ouvrir silencieusement toutes les surfaces limitees.
    const { orderLimiter } = await loadWithoutRedis('production');
    expect((await orderLimiter.check('1.2.3.4')).success).toBe(false);
  });
});

// --- L'invariant qui compte -------------------------------------------------
describe('comportement en PANNE Redis, compartiment par compartiment', () => {
  it('la connexion et l inscription BLOQUENT (fail-closed)', async () => {
    // Laisser passer ici, c'est offrir le brute-force pendant la panne.
    upstash.shouldThrow = true;
    const { signupLimiter, loginLimiter } = await loadWithRedis();

    expect((await signupLimiter.check('1.2.3.4')).success).toBe(false);
    expect((await loginLimiter.check('1.2.3.4')).success).toBe(false);
  });

  it('la reclamation d un code promo BLOQUE (fail-closed)', async () => {
    // ORDER-SPAM. `claimUsage` entame un budget que rien ne rend: c'est le seul
    // dommage irreversible de la creation de commande.
    upstash.shouldThrow = true;
    const { couponClaimLimiter } = await loadWithRedis();

    expect((await couponClaimLimiter.check('1.2.3.4:resto:PROMO10')).success).toBe(false);
  });

  it('la creation de commande LAISSE PASSER (fail-open, delibere)', async () => {
    // RL-FAILOPEN demandait l'inverse. Applique tel quel, une panne Upstash
    // renvoyait 429 sur TOUTE commande, dans tous les restaurants a la fois, et
    // de facon invisible cote restaurateur. Une commande fantome s'annule en
    // cuisine; un service perdu ne se rattrape pas.
    upstash.shouldThrow = true;
    const { orderLimiter } = await loadWithRedis();

    expect((await orderLimiter.check('1.2.3.4:resto')).success).toBe(true);
  });

  it('une commande au tenant NON etabli bloque quand meme', async () => {
    // Ce chemin ne sert qu'a l'attaque: le tenant y vient du Referer, forgeable.
    upstash.shouldThrow = true;
    const { untrustedOrderLimiter } = await loadWithRedis();

    expect((await untrustedOrderLimiter.check('1.2.3.4:resto')).success).toBe(false);
  });
});
