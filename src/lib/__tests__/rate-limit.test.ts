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
    // Le reglage reel du compartiment, pour pouvoir l'affirmer dans un test:
    // sans cela, rien n'empeche de ramener un plafond a sa valeur d'avant.
    reglage: { jetons: number; fenetre: string };
    constructor(opts: { limiter: { jetons: number; fenetre: string } }) {
      this.reglage = opts.limiter;
    }
    async limit() {
      upstash.appels.push('limit');
      if (upstash.shouldThrow) throw new Error('upstash injoignable');
      // La vraie bibliotheque rend un horodatage EPOCH EN MILLISECONDES
      // (`(currentWindow + 1) * windowSize`). Une doublure qui rendrait 0
      // laisserait passer un calcul de delai faux sans que rien ne le voie.
      return {
        success: upstash.success,
        limit: this.reglage.jetons,
        remaining: 9,
        reset: Date.now() + 9 * 60_000,
      };
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
    static slidingWindow(jetons: number, fenetre: string) {
      return { kind: 'slidingWindow', jetons, fenetre };
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
    // Le plafond rendu est celui REELLEMENT configure pour ce compartiment.
    // Cette assertion valait `10` auparavant - la valeur en dur de la
    // doublure, donc un test qui ne verifiait que son propre mock.
    expect(r.limit).toBe(20);
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
    const { signupLimiter, loginPaireLimiter } = await loadWithRedis();

    expect((await signupLimiter.check('1.2.3.4')).success).toBe(false);
    expect((await loginPaireLimiter.check('empreinte:1.2.3.4')).success).toBe(false);
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

// --- Une seule operation atomique ------------------------------------------
/**
 * QUATRE CONCEPTIONS ONT ETE ESSAYEES. Chaque test ci-dessous verrouille une
 * lecon payee:
 *
 *   v1: 5 par 15 min par ADRESSE, consomme avant la verification du mot de
 *       passe. Une connexion REUSSIE coutait un essai, et l'adresse etant
 *       partagee, quatre employes se partageaient cinq connexions par quart
 *       d'heure. Mesure en production: un utilisateur enferme 22 minutes.
 *   v2: lecture (`consulter`) puis comptage apres coup. Non atomique: une
 *       rafale simultanee passait entiere. Et le refus par compte avant
 *       authentification permettait de verrouiller autrui en boucle.
 *   v3: comptage APRES l'echec, sans barrer la route. Un audit a montre que le
 *       plafond devenait decoratif: 800 essais par heure sur un compte.
 *   v4 (ici): une seule operation atomique, `check`, sur le COUPLE
 *       (compte, adresse).
 *
 * D'ou l'invariant teste: il ne reste QU'UNE methode qui compte, et elle
 * compte et tranche d'un seul coup.
 */
describe('check, et rien d autre', () => {
  beforeEach(() => {
    upstash.shouldThrow = false;
    upstash.success = true;
    upstash.appels = [];
  });

  it('compte et tranche en UNE seule operation', async () => {
    const { loginPaireLimiter } = await loadWithRedis();

    const etat = await loginPaireLimiter.check('empreinte:1.2.3.4');

    expect(etat.success).toBe(true);
    expect(upstash.appels).toEqual(['limit']);
  });

  /**
   * Les methodes de la v2 et de la v3 ne doivent pas revenir: une lecture
   * separee de l'ecriture ne peut pas tenir la garantie, et `effacer`
   * declenchait un balayage de tout l'espace de cles Redis a chaque connexion
   * reussie (`resetUsedTokens` fait un SCAN complet, verifie dans la
   * bibliotheque).
   */
  it('n expose plus de lecture sans consommation, ni de remise a zero', async () => {
    const { loginPaireLimiter } = await loadWithRedis();

    expect('consulter' in loginPaireLimiter).toBe(false);
    expect('compterEchec' in loginPaireLimiter).toBe(false);
    expect('effacer' in loginPaireLimiter).toBe(false);
  });

  it('rend un instant de liberation exploitable, pas zero', async () => {
    const { loginPaireLimiter, minutesAvantLiberation } = await loadWithRedis();

    const etat = await loginPaireLimiter.check('empreinte:1.2.3.4');

    expect(etat.reset).toBeGreaterThan(Date.now());
    expect(minutesAvantLiberation(etat.reset)).toBeGreaterThan(1);
  });

  it('les deux compartiments de connexion refusent en panne Redis', async () => {
    const { loginPaireLimiter, loginAdresseLimiter } = await loadWithRedis();
    upstash.shouldThrow = true;

    expect((await loginPaireLimiter.check('empreinte:1.2.3.4')).success).toBe(false);
    expect((await loginAdresseLimiter.check('1.2.3.4')).success).toBe(false);
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
  it('arrondit au-dessus et ajoute une minute de marge', async () => {
    const { minutesAvantLiberation } = await loadWithRedis();
    expect(minutesAvantLiberation(Date.now() + 61_000)).toBe(3);
  });

  /**
   * NE JAMAIS ANNONCER "0 minutes". En panne Redis, l'instant de liberation
   * est inconnu (`reset: 0`) et tous les compartiments d'authentification
   * refusent: le message aurait dit "Reessayez dans 0 minutes", ce qui est
   * absurde et renvoie l'utilisateur essayer aussitot. Constat d'un audit,
   * prouve par execution.
   */
  it('ne rend JAMAIS zero, meme quand l instant est inconnu', async () => {
    const { minutesAvantLiberation } = await loadWithRedis();
    expect(minutesAvantLiberation(0)).toBe(1);
    expect(minutesAvantLiberation(Date.now() + 1_000)).toBeGreaterThanOrEqual(1);
    expect(minutesAvantLiberation(Date.now() - 60_000)).toBeGreaterThanOrEqual(1);
  });
});

// --- Regrouper les adresses ------------------------------------------------
/**
 * POURQUOI CE REGROUPEMENT EXISTE. En IPv6, un abonne ordinaire recoit un bloc
 * /64, soit plus de 18 milliards de milliards d adresses. Compter "par
 * adresse" lui donne un budget neuf a chaque requete: la limite ne vaut rien
 * contre lui, alors qu elle s applique pleinement a un abonne IPv4. Constat
 * d un audit du 2026-11-08.
 */
describe('grouperAdresse', () => {
  it('laisse une adresse IPv4 intacte', async () => {
    const { grouperAdresse } = await loadWithRedis();
    expect(grouperAdresse('102.180.71.143')).toBe('102.180.71.143');
  });

  it('regroupe deux adresses IPv6 du meme /64 sur la MEME cle', async () => {
    const { grouperAdresse } = await loadWithRedis();
    const a = grouperAdresse('2001:0db8:85a3:0000:1111:2222:3333:4444');
    const b = grouperAdresse('2001:0db8:85a3:0000:9999:8888:7777:6666');
    expect(a).toBe(b);
  });

  it('garde deux /64 differents sur des cles differentes', async () => {
    const { grouperAdresse } = await loadWithRedis();
    const a = grouperAdresse('2001:0db8:85a3:0001:1111:2222:3333:4444');
    const b = grouperAdresse('2001:0db8:85a3:0002:1111:2222:3333:4444');
    expect(a).not.toBe(b);
  });

  /**
   * Constat P-03 du test d intrusion du 2026-11-12: la forme abregee (::)
   * etait rendue telle quelle. Un attaquant qui varie la fin de son adresse
   * en forme courte (2001:db8:1:2::1, ::2, ::3...) obtenait une cle neuve a
   * chaque requete.
   */
  it('regroupe les formes abregees d un meme /64 sur la MEME cle', async () => {
    const { grouperAdresse } = await loadWithRedis();
    const attendu = grouperAdresse('2001:0db8:0001:0002:0000:0000:0000:0001');
    expect(grouperAdresse('2001:db8:1:2::1')).toBe(attendu);
    expect(grouperAdresse('2001:db8:1:2::2')).toBe(attendu);
    expect(grouperAdresse('2001:db8:1:2:ffff::9')).toBe(attendu);
    expect(grouperAdresse('2001:DB8:1:2::ABCD')).toBe(attendu);
  });

  it('distingue deux /64 differents meme en forme abregee', async () => {
    const { grouperAdresse } = await loadWithRedis();
    expect(grouperAdresse('2001:db8::1')).not.toBe(grouperAdresse('2001:db8:0:1::1'));
  });

  it('est idempotent: regrouper une cle deja regroupee ne la change pas', async () => {
    const { grouperAdresse } = await loadWithRedis();
    const cle = grouperAdresse('2001:db8:1:2::1');
    expect(grouperAdresse(cle)).toBe(cle);
  });

  it('ramene une IPv4 encapsulee en IPv6 a son adresse IPv4', async () => {
    const { grouperAdresse } = await loadWithRedis();
    expect(grouperAdresse('::ffff:102.180.71.143')).toBe('102.180.71.143');
  });

  it('laisse une valeur illisible telle quelle plutot que de la fusionner', async () => {
    const { grouperAdresse } = await loadWithRedis();
    expect(grouperAdresse('anonymous')).toBe('anonymous');
    expect(grouperAdresse('pas:une:adresse::zz')).toBe('pas:une:adresse::zz');
  });
});

/**
 * Constat P-03: le regroupement /64 n etait applique que par 4 routes. Les
 * 50 autres points d appel comptaient adresse par adresse. Il est desormais
 * fait a la source.
 */
describe('getClientIp regroupe l IPv6 a la source', () => {
  it('getClientIpBrute rend la vraie adresse, pour Turnstile', async () => {
    const { getClientIpBrute } = await loadWithRedis();
    const r = new Request('https://attabl.com/', {
      headers: { 'x-forwarded-for': '2001:db8:1:2::7, 10.0.0.1' },
    });
    expect(getClientIpBrute(r)).toBe('2001:db8:1:2::7');
  });

  it('rend la meme cle pour deux adresses du meme /64', async () => {
    const { getClientIp, getClientIpFromHeaders } = await loadWithRedis();
    const req = (ip: string) =>
      new Request('https://attabl.com/', { headers: { 'x-forwarded-for': ip } });
    expect(getClientIp(req('2001:db8:1:2::1'))).toBe(getClientIp(req('2001:db8:1:2::7, 10.0.0.1')));
    expect(getClientIpFromHeaders(new Headers({ 'x-real-ip': '2001:db8:1:2::3' }))).toBe(
      getClientIp(req('2001:db8:1:2::1')),
    );
  });

  it('laisse une IPv4 intacte', async () => {
    const { getClientIp } = await loadWithRedis();
    const r = new Request('https://attabl.com/', {
      headers: { 'x-forwarded-for': '102.180.71.143' },
    });
    expect(getClientIp(r)).toBe('102.180.71.143');
  });
});

// --- Les plafonds, choisis sur mesure --------------------------------------
/**
 * CES CHIFFRES VIENNENT DE LA PRODUCTION, pas du jugement. Mesure du
 * 2026-11-08: le plus gros menu compte 284 plats (moyenne 68), le plus grand
 * restaurant a 2 membres actifs, et le maximum de commandes jamais observe
 * dans une meme minute est 7.
 *
 * Ce test existe pour qu'un retour en arriere se voie. Ramener le
 * televersement a 20 par minute, c'est reimposer 15 minutes d'attente
 * entrecoupees d'erreurs a qui met les photos d'un menu complet.
 */
describe('plafonds justifies par la mesure', () => {
  beforeEach(() => {
    upstash.shouldThrow = false;
    upstash.success = true;
  });

  it.each([
    ['uploadLimiter', 120, 'un menu de 284 plats a photographier'],
    ['excelImportLimiter', 30, 'importer un menu est iteratif'],
    ['pdfImportLimiter', 30, 'importer un menu est iteratif'],
    ['menuSearchLimiter', 300, 'tous les convives d un lieu derriere une adresse'],
  ])('%s autorise %i (%s)', async (nom, attendu) => {
    const mod = (await loadWithRedis()) as unknown as Record<
      string,
      { check: (id: string) => Promise<{ limit: number }> }
    >;
    expect((await mod[nom].check('cle')).limit).toBe(attendu);
  });

  /**
   * NON-REGRESSION SUR CE QUI A ETE MESURE PUIS LAISSE TEL QUEL. Desserrer un
   * compartiment suffisant, c'est perdre une protection pour rien.
   */
  it.each([
    ['orderLimiter', 20, 'maximum observe: 7 commandes dans la meme minute'],
    ['permissionLimiter', 20, 'le plus grand restaurant a 2 membres'],
    ['assignmentLimiter', 30, 'le plus grand restaurant a 2 membres'],
  ])('%s reste a %i (%s)', async (nom, attendu) => {
    const mod = (await loadWithRedis()) as unknown as Record<
      string,
      { check: (id: string) => Promise<{ limit: number }> }
    >;
    expect((await mod[nom].check('cle')).limit).toBe(attendu);
  });
});
