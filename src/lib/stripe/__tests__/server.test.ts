/**
 * Client Stripe serveur et correspondance prix <-> plan.
 *
 * Deux choses distinctes sont verifiees ici, toutes deux liees a l'argent:
 *
 * 1. L'initialisation PARESSEUSE. Le module lit des variables d'environnement,
 *    mais seulement au premier acces reel. Si cette paresse se perdait, un
 *    simple `import` ferait planter au demarrage toute page qui touche
 *    indirectement ce fichier - sur un environnement (preview, CI) ou les cles
 *    Stripe ne sont pas posees.
 *
 * 2. La recherche INVERSE prix -> plan. Le webhook Stripe recoit un identifiant
 *    de prix et doit en deduire le plan a activer. Une erreur ici donne au
 *    client un plan qu'il n'a pas paye, ou lui retire celui qu'il a paye.
 *
 * Les instances sont mises en cache dans des variables de module: chaque test
 * repart donc d'un module neuf (`resetModules` + import dynamique), sinon le
 * premier test figerait l'environnement pour tous les suivants.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** Constructeur Stripe factice: on ne veut ni reseau, ni cle reelle. */
const constructeurStripe = vi.fn();
vi.mock('stripe', () => ({
  default: class {
    marqueur = 'instance-stripe';
    constructor(cle: string) {
      constructeurStripe(cle);
    }
  },
}));

/** Les 6 identifiants de prix, un par (plan, periodicite). */
const PRIX = {
  NEXT_PUBLIC_STRIPE_PRICE_STARTER_MONTHLY: 'price_starter_m',
  NEXT_PUBLIC_STRIPE_PRICE_STARTER_YEARLY: 'price_starter_y',
  NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY: 'price_pro_m',
  NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY: 'price_pro_y',
  NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY: 'price_business_m',
  NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_YEARLY: 'price_business_y',
};

function poserTousLesPrix(): void {
  for (const [cle, valeur] of Object.entries(PRIX)) vi.stubEnv(cle, valeur);
}

async function chargerModule() {
  return import('../server');
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getStripe', () => {
  it('construit le client avec la cle secrete', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');

    const { getStripe } = await chargerModule();
    getStripe();

    expect(constructeurStripe).toHaveBeenCalledWith('sk_test_123');
  });

  it('reutilise la meme instance aux appels suivants', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');

    const { getStripe } = await chargerModule();

    expect(getStripe()).toBe(getStripe());
    expect(constructeurStripe).toHaveBeenCalledTimes(1);
  });

  it('echoue explicitement quand la cle secrete manque', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');

    const { getStripe } = await chargerModule();

    expect(() => getStripe()).toThrow('STRIPE_SECRET_KEY environment variable is not set');
  });

  it('n echoue PAS a l import quand la cle manque', async () => {
    // Le coeur de l'initialisation paresseuse: importer ce module ne doit
    // jamais suffire a faire tomber un environnement sans cles Stripe.
    vi.stubEnv('STRIPE_SECRET_KEY', '');

    await expect(chargerModule()).resolves.toBeDefined();
    expect(constructeurStripe).not.toHaveBeenCalled();
  });

  it('le proxy `stripe` ne construit rien tant qu on ne lit pas de propriete', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');

    const { stripe } = await chargerModule();
    expect(constructeurStripe).not.toHaveBeenCalled();

    // Premiere lecture de propriete: c'est la que le client nait.
    expect((stripe as unknown as { marqueur: string }).marqueur).toBe('instance-stripe');
    expect(constructeurStripe).toHaveBeenCalledTimes(1);
  });
});

describe('getStripePriceId', () => {
  it('rend le bon identifiant pour chacune des 9 combinaisons', async () => {
    poserTousLesPrix();
    const { getStripePriceId } = await chargerModule();

    expect(getStripePriceId('starter', 'monthly')).toBe('price_starter_m');
    expect(getStripePriceId('starter', 'yearly')).toBe('price_starter_y');
    expect(getStripePriceId('pro', 'monthly')).toBe('price_pro_m');
    expect(getStripePriceId('pro', 'yearly')).toBe('price_pro_y');
    expect(getStripePriceId('business', 'monthly')).toBe('price_business_m');
    expect(getStripePriceId('business', 'yearly')).toBe('price_business_y');
  });

  it('nomme la variable manquante au lieu de rendre undefined', async () => {
    // Un identifiant `undefined` partirait tel quel chez Stripe et echouerait
    // au checkout avec un message incomprehensible. Mieux vaut echouer ici, en
    // disant laquelle des 9 variables n'est pas posee.
    poserTousLesPrix();
    vi.stubEnv('NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY', '');
    const { getStripePriceId } = await chargerModule();

    expect(() => getStripePriceId('pro', 'yearly')).toThrow(
      'Missing env var: NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY',
    );
  });
});

describe('getPlanFromPriceId', () => {
  it('retrouve le plan quelle que soit la periodicite', async () => {
    poserTousLesPrix();
    const { getPlanFromPriceId } = await chargerModule();

    expect(getPlanFromPriceId('price_starter_m')).toBe('starter');
    expect(getPlanFromPriceId('price_starter_y')).toBe('starter');
    expect(getPlanFromPriceId('price_pro_y')).toBe('pro');
    expect(getPlanFromPriceId('price_business_y')).toBe('business');
  });

  it('rend null sur un prix inconnu, sans deviner', async () => {
    // Cas reel: un prix cree a la main dans le tableau de bord Stripe. Rendre
    // null laisse l'appelant refuser; deviner un plan l'accorderait gratuitement.
    poserTousLesPrix();
    const { getPlanFromPriceId } = await chargerModule();

    expect(getPlanFromPriceId('price_inconnu')).toBeNull();
    expect(getPlanFromPriceId('')).toBeNull();
  });
});

describe('getIntervalFromPriceId', () => {
  it('retrouve la periodicite quel que soit le plan', async () => {
    poserTousLesPrix();
    const { getIntervalFromPriceId } = await chargerModule();

    expect(getIntervalFromPriceId('price_starter_m')).toBe('monthly');
    expect(getIntervalFromPriceId('price_pro_y')).toBe('yearly');
    expect(getIntervalFromPriceId('price_business_y')).toBe('yearly');
  });

  it('rend null sur un prix inconnu', async () => {
    poserTousLesPrix();
    const { getIntervalFromPriceId } = await chargerModule();

    expect(getIntervalFromPriceId('price_inconnu')).toBeNull();
  });

  it('reste coherent avec getStripePriceId sur les 9 combinaisons', async () => {
    // Aller-retour: l'identifiant produit par la table doit se relire en
    // (plan, periodicite) identiques. C'est ce qui garantit qu'un abonnement
    // relu depuis Stripe rend le plan reellement paye.
    poserTousLesPrix();
    const { getStripePriceId, getPlanFromPriceId, getIntervalFromPriceId } = await chargerModule();

    for (const plan of ['starter', 'pro', 'business'] as const) {
      for (const intervalle of ['monthly', 'yearly'] as const) {
        const id = getStripePriceId(plan, intervalle);
        expect(getPlanFromPriceId(id)).toBe(plan);
        expect(getIntervalFromPriceId(id)).toBe(intervalle);
      }
    }
  });
});
