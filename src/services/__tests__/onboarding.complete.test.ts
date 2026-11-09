/**
 * Tests de la finalisation d'onboarding.
 *
 * C'est le dernier ecran avant qu'un restaurateur ait un etablissement
 * utilisable. Trois contrats sont verrouilles ici:
 * - VERROU: un etablissement fini n'est jamais reecrit (relancer recreait une
 *   salle et ses tables, et ecrasait les parametres modifies depuis);
 * - ORDRE: `onboarding_completed` est ecrit EN DERNIER (ecrit en premier, un
 *   echec des tables ou de la carte laissait un restaurant "fini" sans tables
 *   ni plats, et la relance etait court-circuitee par le verrou);
 * - REPRISE: chaque creation verifie ce qui existe, une relance ne duplique rien.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const loggerError = vi.fn();
const loggerInfo = vi.fn();
vi.mock('@/lib/logger', () => ({
  logger: {
    error: (...a: unknown[]) => loggerError(...a),
    warn: vi.fn(),
    info: (...a: unknown[]) => loggerInfo(...a),
  },
}));

const createZonesAndTables = vi.fn();
const createDefaultConfig = vi.fn();
vi.mock('../table-config.service', () => ({
  createTableConfigService: () => ({ createZonesAndTables, createDefaultConfig }),
}));

import { completeOnboarding } from '../onboarding.complete';
import { ServiceError } from '../errors';
import type { OnboardingCompleteData } from '../onboarding.types';

/** Journal de tout ce qui part vers la base, pour verifier les payloads. */
type Appel = { table: string; op: string; payload?: unknown };
let appels: Appel[] = [];
/** Resultats programmables, par `table.operation`. File consommee dans l'ordre. */
let resultats: Record<string, unknown[]> = {};

function prochain(cle: string, defaut: unknown): unknown {
  const file = resultats[cle];
  if (file && file.length > 0) return file.shift();
  return defaut;
}

function fakeSupabase(): SupabaseClient {
  return {
    from(table: string) {
      let op = 'select';
      let payload: unknown;
      const builder = {
        select(_cols?: unknown, opts?: { head?: boolean }) {
          // A select chained after insert/update reads the written row back:
          // keep the write operation as the key.
          if (op === 'select' && opts?.head) op = 'count';
          return builder;
        },
        update(v: unknown) {
          op = 'update';
          payload = v;
          appels.push({ table, op, payload });
          return builder;
        },
        upsert(v: unknown) {
          op = 'upsert';
          payload = v;
          appels.push({ table, op, payload });
          return builder;
        },
        insert(v: unknown) {
          op = 'insert';
          payload = v;
          appels.push({ table, op, payload });
          return builder;
        },
        delete() {
          op = 'delete';
          appels.push({ table, op });
          return builder;
        },
        eq: () => builder,
        in: () => builder,
        lt: () => builder,
        is: () => builder,
        order: () => builder,
        limit: () => builder,
        single: async () => prochain(`${table}.${op}`, { data: null, error: null }),
        maybeSingle: async () => prochain(`${table}.${op}`, { data: null, error: null }),
        then(resolve: (v: unknown) => void) {
          // Default for an UPDATE on tenants: one row touched (the launch lock
          // is won). Tests queue `tenants.update` results to override.
          const defaut =
            table === 'tenants' && op === 'update'
              ? { data: [{ id: 't1' }], error: null }
              : { data: null, error: null, count: 0 };
          resolve(prochain(`${table}.${op}`, defaut));
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

function donnees(over: Partial<OnboardingCompleteData> = {}): OnboardingCompleteData {
  return {
    establishmentType: 'restaurant',
    address: '12 rue du Marche',
    city: 'Ouagadougou',
    country: 'BF',
    phone: '+22600000000',
    tableCount: 8,
    logoUrl: '',
    primaryColor: '#CCFF00',
    secondaryColor: '#000000',
    description: 'Cuisine locale',
    tenantSlug: 'chez-amadou',
    ...over,
  } as OnboardingCompleteData;
}

/** Etablissement pas encore lance, avec une salle existante. */
function tenantNonLance(slug = 'chez-amadou') {
  resultats['tenants.select'] = [{ data: { onboarding_completed: false, slug }, error: null }];
  resultats['venues.select'] = [{ data: { id: 'v1' }, error: null }];
}

/** Tenant updates, minus the launch lock (claim / release only touch the timestamp). */
const majTenant = () =>
  (
    appels.filter((a) => a.table === 'tenants' && a.op === 'update').map((a) => a.payload) as Array<
      Record<string, unknown>
    >
  ).filter((p) => !(Object.keys(p).length === 1 && 'onboarding_completed_at' in p));
const verrous = () =>
  (
    appels.filter((a) => a.table === 'tenants' && a.op === 'update').map((a) => a.payload) as Array<
      Record<string, unknown>
    >
  ).filter((p) => Object.keys(p).length === 1 && 'onboarding_completed_at' in p);
const marqueFini = () => majTenant().some((p) => p.onboarding_completed === true);

beforeEach(() => {
  vi.clearAllMocks();
  appels = [];
  resultats = {};
});

describe('verrou: un etablissement lance n est jamais reecrit', () => {
  it('rend le slug sans aucune ecriture ni creation', async () => {
    // Bouton "retour" apres le lancement, onglet resté ouvert, double-clic.
    resultats['tenants.select'] = [
      { data: { onboarding_completed: true, slug: 'chez-amadou' }, error: null },
    ];

    const r = await completeOnboarding(fakeSupabase(), 't1', donnees({ tenantName: 'Autre' }));

    expect(r).toEqual({ slug: 'chez-amadou' });
    expect(appels).toHaveLength(0);
    expect(createDefaultConfig).not.toHaveBeenCalled();
    expect(createZonesAndTables).not.toHaveBeenCalled();
  });

  it('refuse un etablissement introuvable', async () => {
    resultats['tenants.select'] = [{ data: null, error: null }];
    await expect(completeOnboarding(fakeSupabase(), 't1', donnees())).rejects.toBeInstanceOf(
      ServiceError,
    );
  });

  it('refuse sur erreur de lecture au lieu de supposer "pas lance"', async () => {
    resultats['tenants.select'] = [{ data: null, error: { message: 'connexion perdue' } }];
    await expect(completeOnboarding(fakeSupabase(), 't1', donnees())).rejects.toBeInstanceOf(
      ServiceError,
    );
    expect(appels).toHaveLength(0);
  });
});

describe('ordre: le drapeau "fini" est ecrit en dernier', () => {
  it('ecrit les champs AVANT et le drapeau a la toute fin', async () => {
    tenantNonLance();

    await completeOnboarding(fakeSupabase(), 't1', donnees());

    const maj = majTenant();
    expect(maj).toHaveLength(2);
    expect(maj[0]).not.toHaveProperty('onboarding_completed');
    expect(maj[1].onboarding_completed).toBe(true);
    expect(typeof maj[1].onboarding_completed_at).toBe('string');
    // Le drapeau arrive apres la creation des tables.
    expect(createDefaultConfig).toHaveBeenCalled();
    const indexFini = appels.findIndex(
      (a) => a.table === 'tenants' && (a.payload as Record<string, unknown>)?.onboarding_completed,
    );
    const indexProgression = appels.findIndex((a) => a.table === 'onboarding_progress');
    expect(indexFini).toBeLessThan(indexProgression);
  });

  it('ne marque PAS fini quand la creation des tables echoue', async () => {
    tenantNonLance();
    createDefaultConfig.mockRejectedValueOnce(new ServiceError('tables', 'INTERNAL'));

    await expect(completeOnboarding(fakeSupabase(), 't1', donnees())).rejects.toBeInstanceOf(
      ServiceError,
    );
    expect(marqueFini()).toBe(false);
  });

  it('ne marque PAS fini quand la salle ne peut etre creee', async () => {
    resultats['tenants.select'] = [
      { data: { onboarding_completed: false, slug: 'chez-amadou' }, error: null },
    ];
    resultats['venues.select'] = [{ data: null, error: null }];
    resultats['venues.insert'] = [{ data: null, error: { message: 'refus' } }];

    await expect(completeOnboarding(fakeSupabase(), 't1', donnees())).rejects.toBeInstanceOf(
      ServiceError,
    );
    expect(marqueFini()).toBe(false);
    expect(createDefaultConfig).not.toHaveBeenCalled();
  });

  it('remonte une erreur quand le drapeau final ne s ecrit pas', async () => {
    tenantNonLance();
    resultats['tenants.update'] = [
      { data: [{ id: 't1' }], error: null }, // verrou
      { error: null }, // champs
      { error: { message: 'refus' } }, // drapeau final
    ];

    await expect(completeOnboarding(fakeSupabase(), 't1', donnees())).rejects.toThrow(
      /Failed to complete onboarding/,
    );
  });
});

describe('mise a jour du tenant', () => {
  it('remonte un conflit de nom en erreur dediee', async () => {
    // Le restaurateur doit lire "ce nom est deja pris", pas "erreur interne".
    tenantNonLance();
    // Message reel du declencheur enforce_tenant_name_cross_group_unique.
    resultats['tenants.update'] = [
      { data: [{ id: 't1' }], error: null }, // verrou
      { error: { code: 'P0001', message: 'tenant_name_cross_group_conflict' } },
    ];

    await expect(completeOnboarding(fakeSupabase(), 't1', donnees())).rejects.toThrow(
      'RESTAURANT_NAME_TAKEN',
    );
  });

  it('remonte une erreur interne sur echec generique', async () => {
    tenantNonLance();
    resultats['tenants.update'] = [
      { data: [{ id: 't1' }], error: null }, // verrou
      { error: { code: '08006', message: 'connexion perdue' } },
    ];

    await expect(completeOnboarding(fakeSupabase(), 't1', donnees())).rejects.toThrow(
      /Failed to update tenant/,
    );
    expect(marqueFini()).toBe(false);
  });

  it('n ecrit les champs optionnels que s ils sont fournis', async () => {
    // Ecrire `name: undefined` ecraserait le nom saisi a l'inscription.
    tenantNonLance();
    await completeOnboarding(fakeSupabase(), 't1', donnees());

    const maj = majTenant()[0];
    expect(maj).not.toHaveProperty('name');
    expect(maj).not.toHaveProperty('currency');
    expect(maj).not.toHaveProperty('default_locale');
  });

  it('ecrit nom, devise et langue quand ils sont fournis', async () => {
    tenantNonLance();
    await completeOnboarding(
      fakeSupabase(),
      't1',
      donnees({ tenantName: 'Chez Amadou', currency: 'XOF', language: 'fr-FR' }),
    );

    const maj = majTenant()[0];
    expect(maj.name).toBe('Chez Amadou');
    expect(maj.currency).toBe('XOF');
    expect(maj.default_locale).toBe('fr-FR');
  });

  it('aligne supported_currencies sur la devise choisie', async () => {
    // La vitrine lit CETTE colonne pour proposer un changement de devise au
    // convive: un restaurant en XOF se voyait proposer le XAF.
    tenantNonLance();
    await completeOnboarding(fakeSupabase(), 't1', donnees({ currency: 'XOF' }));

    expect(majTenant()[0].supported_currencies).toEqual(['XOF']);
  });

  it('ne touche pas supported_currencies quand aucune devise n est fournie', async () => {
    tenantNonLance();
    await completeOnboarding(fakeSupabase(), 't1', donnees({ tenantName: 'Sans devise' }));

    expect(majTenant()[0]).not.toHaveProperty('supported_currencies');
  });

  it('ne bloque PAS quand le suivi de progression echoue', async () => {
    // Le drapeau du tenant, deja ecrit, fait foi pour "fini".
    tenantNonLance();
    resultats['onboarding_progress.upsert'] = [{ error: { message: 'table absente' } }];

    await expect(completeOnboarding(fakeSupabase(), 't1', donnees())).resolves.toBeDefined();
    expect(loggerError).toHaveBeenCalled();
    expect(marqueFini()).toBe(true);
  });
});

describe('details propres au type (etoiles, terrasse, wifi...)', () => {
  it('les ecrit dans establishment_details au lieu de les jeter', async () => {
    tenantNonLance();
    await completeOnboarding(
      fakeSupabase(),
      't1',
      donnees({ establishmentType: 'hotel', starRating: 4, hasRestaurant: true }),
    );

    expect(majTenant()[0].establishment_details).toEqual({ starRating: 4, hasRestaurant: true });
  });

  it('ecrit un objet vide quand aucun detail n est saisi', async () => {
    tenantNonLance();
    await completeOnboarding(fakeSupabase(), 't1', donnees());

    expect(majTenant()[0].establishment_details).toEqual({});
  });

  it('garde un false explicite (terrasse decochee)', async () => {
    tenantNonLance();
    await completeOnboarding(
      fakeSupabase(),
      't1',
      donnees({ establishmentType: 'bar', hasTerrace: false }),
    );

    expect(majTenant()[0].establishment_details).toEqual({ hasTerrace: false });
  });
});

describe('salle et tables', () => {
  it('reutilise la salle existante au lieu d en creer une seconde', async () => {
    resultats['tenants.select'] = [
      { data: { onboarding_completed: false, slug: 'chez-amadou' }, error: null },
    ];
    resultats['venues.select'] = [{ data: { id: 'v-existante' }, error: null }];

    await completeOnboarding(fakeSupabase(), 't1', donnees());

    expect(appels.some((a) => a.table === 'venues' && a.op === 'insert')).toBe(false);
    expect(createDefaultConfig).toHaveBeenCalledWith('t1', 'v-existante', 8);
  });

  it('cree une salle quand il n y en a aucune', async () => {
    resultats['tenants.select'] = [
      { data: { onboarding_completed: false, slug: 'chez-amadou' }, error: null },
    ];
    resultats['venues.select'] = [{ data: null, error: null }];
    resultats['venues.insert'] = [{ data: { id: 'v-neuve' }, error: null }];

    await completeOnboarding(fakeSupabase(), 't1', donnees());

    expect(appels.some((a) => a.table === 'venues' && a.op === 'insert')).toBe(true);
    expect(createDefaultConfig).toHaveBeenCalledWith('t1', 'v-neuve', 8);
  });

  it('cree les zones decrites par le restaurateur', async () => {
    tenantNonLance();

    await completeOnboarding(
      fakeSupabase(),
      't1',
      donnees({
        tableZones: [{ name: 'Terrasse', tableCount: 4 }],
      } as Partial<OnboardingCompleteData>),
    );

    expect(createZonesAndTables).toHaveBeenCalledWith('t1', 'v1', [
      { name: 'Terrasse', tableCount: 4, defaultCapacity: 2 },
    ]);
    expect(createDefaultConfig).not.toHaveBeenCalled();
  });

  it('retombe sur la configuration par defaut quand le restaurateur passe l etape', async () => {
    tenantNonLance();

    await completeOnboarding(
      fakeSupabase(),
      't1',
      donnees({
        tableConfigMode: 'skip',
        tableZones: [{ name: 'Terrasse', tableCount: 4 }],
      } as Partial<OnboardingCompleteData>),
    );

    expect(createZonesAndTables).not.toHaveBeenCalled();
    expect(createDefaultConfig).toHaveBeenCalledWith('t1', 'v1', 8);
  });

  it('utilise 10 tables par defaut quand le nombre manque', async () => {
    tenantNonLance();

    await completeOnboarding(fakeSupabase(), 't1', donnees({ tableCount: 0 }));

    expect(createDefaultConfig).toHaveBeenCalledWith('t1', 'v1', 10);
  });

  it('ne recree PAS de tables quand il en existe deja (relance apres echec partiel)', async () => {
    tenantNonLance();
    resultats['tables.count'] = [{ count: 10, error: null }];

    await completeOnboarding(fakeSupabase(), 't1', donnees());

    expect(createDefaultConfig).not.toHaveBeenCalled();
    expect(createZonesAndTables).not.toHaveBeenCalled();
    expect(marqueFini()).toBe(true);
  });

  it('refuse sur erreur de comptage au lieu de dupliquer', async () => {
    tenantNonLance();
    resultats['tables.count'] = [{ count: null, error: { message: 'timeout' } }];

    await expect(completeOnboarding(fakeSupabase(), 't1', donnees())).rejects.toBeInstanceOf(
      ServiceError,
    );
    expect(createDefaultConfig).not.toHaveBeenCalled();
    expect(marqueFini()).toBe(false);
  });
});

describe('creation de la carte', () => {
  const avecCarteNeuve = () => {
    tenantNonLance();
    resultats['menus.insert'] = [{ data: { id: 'm1' }, error: null }];
  };

  it('ne cree aucune carte quand aucun plat n est saisi', async () => {
    avecCarteNeuve();

    await completeOnboarding(fakeSupabase(), 't1', donnees({ menuItems: [] }));

    expect(appels.some((a) => a.table === 'menus')).toBe(false);
  });

  it('ignore les plats sans nom', async () => {
    avecCarteNeuve();

    await completeOnboarding(
      fakeSupabase(),
      't1',
      donnees({ menuItems: [{ name: '   ' }, { name: '' }] } as Partial<OnboardingCompleteData>),
    );

    expect(appels.some((a) => a.table === 'menus')).toBe(false);
  });

  it('regroupe les plats par categorie et range les sans-categorie dans Menu', async () => {
    avecCarteNeuve();
    resultats['categories.insert'] = [
      { data: { id: 'c1' }, error: null },
      { data: { id: 'c2' }, error: null },
      { data: { id: 'c3' }, error: null },
    ];

    await completeOnboarding(
      fakeSupabase(),
      't1',
      donnees({
        menuItems: [
          { name: 'Poulet', category: 'Plats', price: 3000 },
          { name: 'Bissap', category: 'Boissons', price: 500 },
          { name: 'Pain', price: 100 },
        ],
      } as Partial<OnboardingCompleteData>),
    );

    const cats = appels
      .filter((a) => a.table === 'categories' && a.op === 'insert')
      .map((a) => (a.payload as { name: string }).name);
    expect(cats).toEqual(['Plats', 'Boissons', 'Menu']);
  });

  it('n ecrit PAS de display_order sur les plats: la colonne n existe pas', async () => {
    // Le faux client Supabase accepte n'importe quel champ: ce test verrouille
    // qu'aucun champ inexistant (PGRST204, tout le lot rejete) n'est ecrit.
    avecCarteNeuve();
    resultats['categories.insert'] = [
      { data: { id: 'c1' }, error: null },
      { data: { id: 'c2' }, error: null },
    ];

    await completeOnboarding(
      fakeSupabase(),
      't1',
      donnees({
        menuItems: [
          { name: 'Poulet', category: 'Plats' },
          { name: 'Poisson', category: 'Plats' },
          { name: 'Bissap', category: 'Boissons' },
        ],
      } as Partial<OnboardingCompleteData>),
    );

    const platsInseres = appels
      .filter((a) => a.table === 'menu_items' && a.op === 'insert')
      .flatMap((a) => a.payload as Array<Record<string, unknown>>);

    expect(platsInseres).toHaveLength(3);
    for (const plat of platsInseres) {
      expect(plat).not.toHaveProperty('display_order');
      expect(plat).toHaveProperty('category_id');
      expect(plat).toHaveProperty('tenant_id');
    }
  });

  it('echoue, nettoie et ne marque PAS fini quand une rubrique echoue', async () => {
    // Avant: journalise, puis "succes" - les plats saisis etaient perdus.
    avecCarteNeuve();
    resultats['categories.insert'] = [{ data: null, error: { message: 'PGRST204' } }];

    await expect(
      completeOnboarding(
        fakeSupabase(),
        't1',
        donnees({
          menuItems: [{ name: 'Poulet', category: 'Plats' }],
        } as Partial<OnboardingCompleteData>),
      ),
    ).rejects.toBeInstanceOf(ServiceError);

    expect(appels.some((a) => a.table === 'menu_items')).toBe(false);
    // La carte creee par cette tentative est supprimee (cascade rubriques/plats).
    expect(appels.some((a) => a.table === 'menus' && a.op === 'delete')).toBe(true);
    expect(marqueFini()).toBe(false);
  });

  it('echoue et nettoie quand l insertion des plats echoue', async () => {
    avecCarteNeuve();
    resultats['categories.insert'] = [{ data: { id: 'c1' }, error: null }];
    resultats['menu_items.insert'] = [{ error: { message: 'refus' } }];

    await expect(
      completeOnboarding(
        fakeSupabase(),
        't1',
        donnees({
          menuItems: [{ name: 'Poulet', category: 'Plats' }],
        } as Partial<OnboardingCompleteData>),
      ),
    ).rejects.toBeInstanceOf(ServiceError);

    expect(appels.some((a) => a.table === 'menus' && a.op === 'delete')).toBe(true);
    expect(marqueFini()).toBe(false);
  });

  it('echoue sans rien creer quand la carte elle-meme echoue', async () => {
    tenantNonLance();
    resultats['menus.insert'] = [{ data: null, error: { message: 'refus' } }];

    await expect(
      completeOnboarding(
        fakeSupabase(),
        't1',
        donnees({
          menuItems: [{ name: 'Poulet', category: 'Plats' }],
        } as Partial<OnboardingCompleteData>),
      ),
    ).rejects.toBeInstanceOf(ServiceError);
    expect(appels.some((a) => a.table === 'categories')).toBe(false);
    expect(marqueFini()).toBe(false);
  });

  it('reprend la carte laissee vide par une tentative precedente', async () => {
    tenantNonLance();
    resultats['menus.select'] = [{ data: { id: 'm-ancienne' }, error: null }];
    resultats['categories.count'] = [{ count: 0, error: null }];
    resultats['categories.insert'] = [{ data: { id: 'c1' }, error: null }];

    await completeOnboarding(
      fakeSupabase(),
      't1',
      donnees({
        menuItems: [{ name: 'Poulet', category: 'Plats' }],
      } as Partial<OnboardingCompleteData>),
    );

    expect(appels.some((a) => a.table === 'menus' && a.op === 'insert')).toBe(false);
    const cat = appels.find((a) => a.table === 'categories' && a.op === 'insert');
    expect((cat?.payload as { menu_id: string }).menu_id).toBe('m-ancienne');
  });

  it('ne duplique pas la carte deja remplie par une tentative precedente', async () => {
    tenantNonLance();
    resultats['menus.select'] = [{ data: { id: 'm-ancienne' }, error: null }];
    resultats['categories.count'] = [{ count: 2, error: null }];

    await completeOnboarding(
      fakeSupabase(),
      't1',
      donnees({
        menuItems: [{ name: 'Poulet', category: 'Plats' }],
      } as Partial<OnboardingCompleteData>),
    );

    expect(appels.some((a) => a.table === 'categories' && a.op === 'insert')).toBe(false);
    expect(marqueFini()).toBe(true);
  });
});

describe('design QR choisi pendant l onboarding', () => {
  it('l enregistre comme design par defaut au lieu de le jeter', async () => {
    tenantNonLance();

    await completeOnboarding(
      fakeSupabase(),
      't1',
      donnees({
        qrTemplate: 'carte',
        qrStyle: 'dark',
        qrCta: 'Commandez ici',
        qrDescription: 'Wifi: attabl',
      }),
    );

    const qr = appels.find((a) => a.table === 'qr_designs' && a.op === 'insert')?.payload as {
      is_default: boolean;
      config: {
        templateId: string;
        ctaText: string;
        qrBgColor: string;
        printLayout: { message: { enabled: boolean; text: string } };
      };
    };
    expect(qr.is_default).toBe(true);
    expect(qr.config.templateId).toBe('carte');
    expect(qr.config.ctaText).toBe('Commandez ici');
    expect(qr.config.qrBgColor).toBe('#1a1a1a');
    expect(qr.config.printLayout.message).toEqual({ enabled: true, text: 'Wifi: attabl' });
  });

  it('ne remplace pas un design par defaut existant', async () => {
    tenantNonLance();
    resultats['qr_designs.select'] = [{ data: { id: 'qr-existant' }, error: null }];

    await completeOnboarding(fakeSupabase(), 't1', donnees({ qrTemplate: 'carte' }));

    expect(appels.some((a) => a.table === 'qr_designs' && a.op === 'insert')).toBe(false);
  });

  it('ne bloque PAS le lancement d une offre sans personnalisation QR', async () => {
    // Regle d'abonnement (declencheur enforce_qr_customization_entitlement).
    tenantNonLance();
    resultats['qr_designs.insert'] = [
      {
        error: {
          code: '23514',
          message: 'QR customization requires the Pro plan or higher',
        },
      },
    ];

    await expect(completeOnboarding(fakeSupabase(), 't1', donnees())).resolves.toBeDefined();
    expect(marqueFini()).toBe(true);
    expect(loggerInfo).toHaveBeenCalled();
  });

  it('echoue sur toute autre erreur du design QR', async () => {
    tenantNonLance();
    resultats['qr_designs.insert'] = [{ error: { code: '23514', message: 'autre contrainte' } }];

    await expect(completeOnboarding(fakeSupabase(), 't1', donnees())).rejects.toBeInstanceOf(
      ServiceError,
    );
    expect(marqueFini()).toBe(false);
  });
});

describe('slug rendu a l appelant', () => {
  it('rend le slug lu en base', async () => {
    // C'est lui qui sert a rediriger vers l'espace: un mauvais slug envoie le
    // restaurateur sur une page introuvable a la fin de son inscription.
    tenantNonLance('chez-amadou-2');

    const r = await completeOnboarding(fakeSupabase(), 't1', donnees());

    expect(r.slug).toBe('chez-amadou-2');
  });
});

describe('un seul lancement a la fois (verrou)', () => {
  it('refuse en CONFLICT, sans rien ecrire, quand un autre lancement tient le verrou', async () => {
    // Deux onglets, ou une relance mobile pendant que la 1re requete tourne:
    // les deux voyaient "0 table" et les creaient en double.
    tenantNonLance();
    // Verrou ni libre ni expire: les deux prises ne touchent aucune ligne.
    resultats['tenants.update'] = [
      { data: [], error: null },
      { data: [], error: null },
    ];
    // ... et la relecture montre un verrou recent tenu par un autre lancement.
    resultats['tenants.select'] = [
      { data: { onboarding_completed: false, slug: 'chez-amadou' }, error: null },
      {
        data: { onboarding_completed: false, onboarding_completed_at: new Date().toISOString() },
        error: null,
      },
    ];

    await expect(completeOnboarding(fakeSupabase(), 't1', donnees())).rejects.toMatchObject({
      message: 'ONBOARDING_IN_PROGRESS',
      code: 'CONFLICT',
    });
    expect(majTenant()).toHaveLength(0);
    expect(createDefaultConfig).not.toHaveBeenCalled();
    expect(appels.some((a) => a.table === 'menus' || a.table === 'qr_designs')).toBe(false);
  });

  it('libere le verrou apres un echec, pour une relance immediate', async () => {
    tenantNonLance();
    createDefaultConfig.mockRejectedValueOnce(new ServiceError('tables', 'INTERNAL'));

    await expect(completeOnboarding(fakeSupabase(), 't1', donnees())).rejects.toBeInstanceOf(
      ServiceError,
    );
    const v = verrous();
    expect(typeof v[0].onboarding_completed_at).toBe('string'); // pris
    expect(v[v.length - 1].onboarding_completed_at).toBeNull(); // rendu
  });

  it('attend la fin de TOUTES les branches avant de liberer le verrou', async () => {
    // Promise.all rejetait des le 1er echec pendant que la carte s'ecrivait
    // encore: le verrou etait rendu sous des ecritures en cours.
    tenantNonLance();
    resultats['menus.insert'] = [{ data: { id: 'm1' }, error: null }];
    resultats['categories.insert'] = [{ data: { id: 'c1' }, error: null }];
    let carteFinie = false;
    createDefaultConfig.mockRejectedValueOnce(new ServiceError('tables', 'INTERNAL'));
    const origine = fakeSupabase();
    const lent = {
      from(table: string) {
        const b = origine.from(table) as unknown as { insert: (v: unknown) => unknown };
        if (table === 'menu_items') {
          const ins = b.insert.bind(b);
          b.insert = (v: unknown) => {
            const r = ins(v) as { then: (res: (x: unknown) => void) => void };
            return {
              then(res: (x: unknown) => void) {
                setTimeout(() => {
                  carteFinie = true;
                  r.then(res);
                }, 20);
              },
            };
          };
        }
        return b;
      },
    } as unknown as SupabaseClient;

    await expect(
      completeOnboarding(
        lent,
        't1',
        donnees({
          menuItems: [{ name: 'Poulet', category: 'Plats' }],
        } as Partial<OnboardingCompleteData>),
      ),
    ).rejects.toBeInstanceOf(ServiceError);
    expect(carteFinie).toBe(true);
    const v = verrous();
    expect(v[v.length - 1].onboarding_completed_at).toBeNull();
  });

  it('reprend un verrou expire (lancement precedent plante)', async () => {
    tenantNonLance();
    resultats['tenants.update'] = [
      { data: [], error: null }, // pas libre
      { data: [{ id: 't1' }], error: null }, // mais expire: repris
    ];
    await completeOnboarding(fakeSupabase(), 't1', donnees());
    expect(marqueFini()).toBe(true);
  });

  it('remonte une erreur interne quand la prise du verrou echoue', async () => {
    tenantNonLance();
    resultats['tenants.update'] = [{ data: null, error: { message: 'timeout' } }];
    await expect(completeOnboarding(fakeSupabase(), 't1', donnees())).rejects.toMatchObject({
      code: 'INTERNAL',
    });
    expect(createDefaultConfig).not.toHaveBeenCalled();
  });
});

describe('details: seuls ceux du type choisi sont gardes', () => {
  it('jette la terrasse d un bar devenu hotel', async () => {
    // Le brouillon garde les reponses de tous les types parcourus.
    tenantNonLance();
    await completeOnboarding(
      fakeSupabase(),
      't1',
      donnees({ establishmentType: 'hotel', hasTerrace: true, starRating: 3 }),
    );
    expect(majTenant()[0].establishment_details).toEqual({ starRating: 3 });
  });
});

describe('verrou: proprietaire et droits (contre-audit 2026-11-08)', () => {
  it('ne libere QUE son propre verrou (filtre sur son horodatage)', async () => {
    tenantNonLance();
    const filtres: Array<[string, unknown]> = [];
    const base = fakeSupabase();
    const espion = {
      from(table: string) {
        const b = base.from(table) as unknown as Record<string, (...a: unknown[]) => unknown>;
        const eq = b.eq;
        b.eq = (col: unknown, val: unknown) => {
          if (table === 'tenants') filtres.push([col as string, val]);
          return eq(col, val);
        };
        return b;
      },
    } as unknown as SupabaseClient;
    createDefaultConfig.mockRejectedValueOnce(new ServiceError('tables', 'INTERNAL'));

    await expect(completeOnboarding(espion, 't1', donnees())).rejects.toBeInstanceOf(ServiceError);

    const pris = verrous()[0].onboarding_completed_at;
    expect(filtres).toContainEqual(['onboarding_completed_at', pris]);
  });

  it('dit "permissions insuffisantes", pas "en cours", quand la mise a jour est refusee', async () => {
    // RLS (has_tenant_write_permission) refuse: zero ligne, sans verrou tenu.
    resultats['tenants.select'] = [
      { data: { onboarding_completed: false, slug: 'chez-amadou' }, error: null },
      { data: { onboarding_completed: false, onboarding_completed_at: null }, error: null },
    ];
    resultats['tenants.update'] = [
      { data: [], error: null },
      { data: [], error: null },
    ];
    await expect(completeOnboarding(fakeSupabase(), 't1', donnees())).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('lit un horodatage sans fuseau comme de l UTC', async () => {
    // PostgREST rend `timestamp` sans zone; frais de 1 s => verrou tenu.
    const frais = new Date(Date.now() - 1000).toISOString().replace('Z', '');
    resultats['tenants.select'] = [
      { data: { onboarding_completed: false, slug: 'chez-amadou' }, error: null },
      { data: { onboarding_completed: false, onboarding_completed_at: frais }, error: null },
    ];
    resultats['tenants.update'] = [
      { data: [], error: null },
      { data: [], error: null },
    ];
    await expect(completeOnboarding(fakeSupabase(), 't1', donnees())).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});
