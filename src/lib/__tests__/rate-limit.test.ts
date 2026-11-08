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
const upstash = {
  shouldThrow: false,
  success: true,
  /** Jetons restants rendus par `getRemaining` (consultation sans consommation). */
  remaining: 9,
  /** Journal des appels, pour prouver qu'une consultation NE CONSOMME PAS. */
  appels: [] as string[],
};

vi.mock('@upstash/redis', () => ({
  Redis: class {},
}));

vi.mock('@upstash/ratelimit', () => {
  class FakeRatelimit {
    async limit() {
      upstash.appels.push('limit');
      if (upstash.shouldThrow) throw new Error('upstash injoignable');
      return { success: upstash.success, limit: 10, remaining: 9, reset: 0 };
    }
    async getRemaining() {
      upstash.appels.push('getRemaining');
      if (upstash.shouldThrow) throw new Error('upstash injoignable');
      return { remaining: upstash.remaining, reset: Date.now() + 600_000, limit: 20 };
    }
    async resetUsedTokens() {
      upstash.appels.push('resetUsedTokens');
      if (upstash.shouldThrow) throw new Error('upstash injoignable');
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
    const { signupLimiter, loginCompteLimiter, loginAdresseLimiter } = await loadWithRedis();

    expect((await signupLimiter.check('1.2.3.4')).success).toBe(false);
    // Les deux compartiments de connexion refusent, y compris en CONSULTATION:
    // une panne de Redis ne doit pas ouvrir la page de connexion.
    expect((await loginCompteLimiter.consulter('empreinte')).success).toBe(false);
    expect((await loginAdresseLimiter.consulter('1.2.3.4')).success).toBe(false);
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

// --- Ne compter que les echecs ----------------------------------------------
/**
 * CE QUE CES TESTS VERROUILLENT. Le compteur de connexion etait consomme AVANT
 * la verification du mot de passe: entrer son mot de passe CORRECTEMENT coutait
 * un essai. Quatre employes qui se connectent le matin depuis le meme Wi-Fi, un
 * cinquieme qui se trompe une fois, et toute l'equipe etait dehors 15 minutes.
 * Une connexion reussie n'est pas une attaque.
 */
describe('consulter / compterEchec / effacer', () => {
  beforeEach(() => {
    upstash.shouldThrow = false;
    upstash.success = true;
    upstash.remaining = 9;
    upstash.appels = [];
  });

  it('consulter NE consomme PAS de jeton', async () => {
    const { loginCompteLimiter } = await loadWithRedis();

    await loginCompteLimiter.consulter('empreinte');

    expect(upstash.appels).toEqual(['getRemaining']);
    expect(upstash.appels).not.toContain('limit');
  });

  it('consulter refuse quand il ne reste aucun jeton', async () => {
    const { loginCompteLimiter } = await loadWithRedis();
    upstash.remaining = 0;

    const etat = await loginCompteLimiter.consulter('empreinte');

    expect(etat.success).toBe(false);
    expect(etat.reset).toBeGreaterThan(Date.now());
  });

  it('consulter autorise tant qu il reste un jeton', async () => {
    const { loginCompteLimiter } = await loadWithRedis();
    upstash.remaining = 1;

    expect((await loginCompteLimiter.consulter('empreinte')).success).toBe(true);
  });

  it('compterEchec consomme un jeton', async () => {
    const { loginCompteLimiter } = await loadWithRedis();

    await loginCompteLimiter.compterEchec('empreinte');

    expect(upstash.appels).toEqual(['limit']);
  });

  /** Un echec ne doit jamais faire echouer la REPONSE: la comptabilite est secondaire. */
  it('compterEchec ne leve pas quand Redis tombe', async () => {
    const { loginCompteLimiter } = await loadWithRedis();
    upstash.shouldThrow = true;

    await expect(loginCompteLimiter.compterEchec('empreinte')).resolves.toBeUndefined();
  });

  it('effacer remet le compteur a zero', async () => {
    const { loginCompteLimiter } = await loadWithRedis();

    await loginCompteLimiter.effacer('empreinte');

    expect(upstash.appels).toEqual(['resetUsedTokens']);
  });

  it('effacer ne leve pas quand Redis tombe', async () => {
    const { loginCompteLimiter } = await loadWithRedis();
    upstash.shouldThrow = true;

    await expect(loginCompteLimiter.effacer('empreinte')).resolves.toBeUndefined();
  });

  it('sans Redis en production, consulter REFUSE', async () => {
    const { loginCompteLimiter } = await loadWithoutRedis('production');
    expect((await loginCompteLimiter.consulter('empreinte')).success).toBe(false);
  });
});

// --- La cle de compteur d'un compte ----------------------------------------
describe('cleCompte', () => {
  it('ne contient pas l email: un compteur n est pas un annuaire', async () => {
    const { cleCompte } = await loadWithRedis();
    const cle = cleCompte('Patron@Exemple.TEST');

    expect(cle).not.toContain('Patron');
    expect(cle).not.toContain('exemple');
    expect(cle).not.toContain('@');
    expect(cle).toMatch(/^[0-9a-f]{32}$/);
  });

  /** Sinon "Patron@x" et "patron@x " seraient deux comptes differents a compter. */
  it('ignore la casse et les espaces', async () => {
    const { cleCompte } = await loadWithRedis();
    expect(cleCompte('  Patron@Exemple.test ')).toBe(cleCompte('patron@exemple.test'));
  });

  it('deux comptes distincts ont deux cles distinctes', async () => {
    const { cleCompte } = await loadWithRedis();
    expect(cleCompte('a@exemple.test')).not.toBe(cleCompte('b@exemple.test'));
  });
});

describe('minutesAvantLiberation', () => {
  it('rend le nombre de minutes, arrondi au-dessus', async () => {
    const { minutesAvantLiberation } = await loadWithRedis();
    expect(minutesAvantLiberation(Date.now() + 61_000)).toBe(2);
  });

  it('ne rend jamais zero quand le compteur est encore pris', async () => {
    const { minutesAvantLiberation } = await loadWithRedis();
    expect(minutesAvantLiberation(Date.now() + 1_000)).toBe(1);
  });

  it('rend zero quand le delai est inconnu', async () => {
    const { minutesAvantLiberation } = await loadWithRedis();
    expect(minutesAvantLiberation(0)).toBe(0);
  });
});
