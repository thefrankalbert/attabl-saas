/**
 * Tests de la finalisation d'onboarding.
 *
 * C'est le dernier ecran avant qu'un restaurateur ait un etablissement
 * utilisable. Ses echecs sont silencieux par nature: une categorie non creee ne
 * leve rien, elle laisse simplement une carte vide que le restaurateur decouvre
 * en plein service. D'ou l'insistance des tests sur ce qui est journalise sans
 * interrompre, et sur l'ordre d'affichage - deux choses qu'aucune erreur
 * visible ne signale.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const loggerError = vi.fn();
vi.mock('@/lib/logger', () => ({
  logger: { error: (...a: unknown[]) => loggerError(...a), warn: vi.fn(), info: vi.fn() },
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
          if (opts?.head) op = 'count';
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
        eq: () => builder,
        is: () => builder,
        order: () => builder,
        limit: () => builder,
        single: async () => prochain(`${table}.${op}`, { data: null, error: null }),
        maybeSingle: async () => prochain(`${table}.${op}`, { data: null, error: null }),
        then(resolve: (v: unknown) => void) {
          resolve(prochain(`${table}.${op}`, { data: null, error: null, count: 0 }));
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
    logoUrl: null,
    primaryColor: '#CCFF00',
    secondaryColor: '#000000',
    description: 'Cuisine locale',
    tenantSlug: 'chez-amadou',
    ...over,
  } as OnboardingCompleteData;
}

beforeEach(() => {
  vi.clearAllMocks();
  appels = [];
  resultats = {};
});

describe('garde d idempotence', () => {
  it('ressort immediatement si l onboarding est fini ET la carte creee', async () => {
    // Double-clic sur "Terminer", ou retour arriere du navigateur. Rejouer
    // creerait une seconde carte complete en doublon.
    resultats['tenants.select'] = [
      { data: { onboarding_completed: true, slug: 'chez-amadou' }, error: null },
    ];
    resultats['categories.count'] = [{ count: 3 }];

    const r = await completeOnboarding(fakeSupabase(), 't1', donnees());

    expect(r).toEqual({ slug: 'chez-amadou' });
    expect(appels.filter((a) => a.op === 'update')).toHaveLength(0);
    expect(createDefaultConfig).not.toHaveBeenCalled();
  });

  it('poursuit si l onboarding est marque fini mais qu AUCUNE categorie n existe', async () => {
    // Cas reel: la mise a jour du tenant a reussi, la creation de la carte a
    // echoue. Ressortir ici laisserait le restaurateur avec une carte vide et
    // aucun moyen de relancer.
    resultats['tenants.select'] = [
      { data: { onboarding_completed: true, slug: 'chez-amadou' }, error: null },
    ];
    resultats['categories.count'] = [{ count: 0 }];

    await completeOnboarding(fakeSupabase(), 't1', donnees());

    expect(appels.some((a) => a.table === 'tenants' && a.op === 'update')).toBe(true);
  });
});

describe('mise a jour du tenant', () => {
  it('remonte un conflit de nom en erreur dediee', async () => {
    // Le restaurateur doit lire "ce nom est deja pris", pas "erreur interne".
    resultats['tenants.update'] = [{ error: { code: '23505', message: 'tenants_name_key' } }];

    await expect(completeOnboarding(fakeSupabase(), 't1', donnees())).rejects.toBeInstanceOf(
      ServiceError,
    );
  });

  it('remonte une erreur interne sur echec generique', async () => {
    resultats['tenants.update'] = [{ error: { code: '08006', message: 'connexion perdue' } }];

    await expect(completeOnboarding(fakeSupabase(), 't1', donnees())).rejects.toThrow(
      /Failed to update tenant/,
    );
  });

  it('n ecrit les champs optionnels que s ils sont fournis', async () => {
    // Ecrire `name: undefined` ecraserait le nom saisi a l'inscription.
    await completeOnboarding(fakeSupabase(), 't1', donnees());

    const maj = appels.find((a) => a.table === 'tenants' && a.op === 'update')?.payload as Record<
      string,
      unknown
    >;
    expect(maj).not.toHaveProperty('name');
    expect(maj).not.toHaveProperty('currency');
    expect(maj.onboarding_completed).toBe(true);
  });

  it('ecrit nom, devise et langue quand ils sont fournis', async () => {
    await completeOnboarding(
      fakeSupabase(),
      't1',
      donnees({ tenantName: 'Chez Amadou', currency: 'XOF', language: 'fr' }),
    );

    const maj = appels.find((a) => a.table === 'tenants' && a.op === 'update')?.payload as Record<
      string,
      unknown
    >;
    expect(maj.name).toBe('Chez Amadou');
    expect(maj.currency).toBe('XOF');
    expect(maj.default_locale).toBe('fr');
  });

  it('ne bloque PAS quand le suivi de progression echoue', async () => {
    // Le suivi est de la telemetrie: son echec ne doit pas priver le
    // restaurateur de son etablissement.
    resultats['onboarding_progress.upsert'] = [{ error: { message: 'table absente' } }];

    await expect(completeOnboarding(fakeSupabase(), 't1', donnees())).resolves.toBeDefined();
    expect(loggerError).toHaveBeenCalled();
  });
});

describe('salle et tables', () => {
  it('reutilise la salle existante au lieu d en creer une seconde', async () => {
    resultats['venues.select'] = [{ data: { id: 'v-existante' }, error: null }];

    await completeOnboarding(fakeSupabase(), 't1', donnees());

    expect(appels.some((a) => a.table === 'venues' && a.op === 'insert')).toBe(false);
    expect(createDefaultConfig).toHaveBeenCalledWith('t1', 'v-existante', 8);
  });

  it('cree une salle quand il n y en a aucune', async () => {
    resultats['venues.select'] = [{ data: null, error: null }];
    resultats['venues.insert'] = [{ data: { id: 'v-neuve' }, error: null }];

    await completeOnboarding(fakeSupabase(), 't1', donnees());

    expect(appels.some((a) => a.table === 'venues' && a.op === 'insert')).toBe(true);
    expect(createDefaultConfig).toHaveBeenCalledWith('t1', 'v-neuve', 8);
  });

  it('cree les zones decrites par le restaurateur', async () => {
    resultats['venues.select'] = [{ data: { id: 'v1' }, error: null }];

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
    resultats['venues.select'] = [{ data: { id: 'v1' }, error: null }];

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
    resultats['venues.select'] = [{ data: { id: 'v1' }, error: null }];

    await completeOnboarding(fakeSupabase(), 't1', donnees({ tableCount: 0 }));

    expect(createDefaultConfig).toHaveBeenCalledWith('t1', 'v1', 10);
  });
});

describe('creation de la carte', () => {
  const avecVenue = () => {
    resultats['venues.select'] = [{ data: { id: 'v1' }, error: null }];
    resultats['menus.insert'] = [{ data: { id: 'm1' }, error: null }];
  };

  it('ne cree aucune carte quand aucun plat n est saisi', async () => {
    avecVenue();

    await completeOnboarding(fakeSupabase(), 't1', donnees({ menuItems: [] }));

    expect(appels.some((a) => a.table === 'menus')).toBe(false);
  });

  it('ignore les plats sans nom', async () => {
    avecVenue();

    await completeOnboarding(
      fakeSupabase(),
      't1',
      donnees({ menuItems: [{ name: '   ' }, { name: '' }] } as Partial<OnboardingCompleteData>),
    );

    expect(appels.some((a) => a.table === 'menus')).toBe(false);
  });

  it('regroupe les plats par categorie et range les sans-categorie dans Menu', async () => {
    avecVenue();
    resultats['categories.insert'] = [
      { data: { id: 'c1' }, error: null },
      { data: { id: 'c2' }, error: null },
    ];

    await completeOnboarding(
      fakeSupabase(),
      't1',
      donnees({
        menuItems: [
          { name: 'Poulet', category: 'Plats', price: 3000 },
          { name: 'Bissap', category: 'Boissons', price: 500 },
        ],
      } as Partial<OnboardingCompleteData>),
    );

    const cats = appels
      .filter((a) => a.table === 'categories' && a.op === 'insert')
      .map((a) => (a.payload as { name: string }).name);
    expect(cats).toEqual(['Plats', 'Boissons']);
  });

  it('donne aux plats des ordres d affichage qui ne se chevauchent PAS', async () => {
    // Le point delicat du fichier. Les categories sont inserees en parallele;
    // un compteur mutable partage produirait des display_order dupliques et une
    // carte dont l'ordre change a chaque rechargement.
    avecVenue();
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

    const ordres = appels
      .filter((a) => a.table === 'menu_items' && a.op === 'insert')
      .flatMap((a) => (a.payload as Array<{ display_order: number }>).map((i) => i.display_order))
      .sort((a, b) => a - b);

    expect(ordres).toEqual([1, 2, 3]);
    expect(new Set(ordres).size).toBe(ordres.length);
  });

  it('journalise et n insere aucun plat quand la categorie echoue', async () => {
    // Inserer les plats avec un category_id absent les rendrait invisibles.
    avecVenue();
    resultats['categories.insert'] = [{ data: null, error: { message: 'PGRST204' } }];

    await completeOnboarding(
      fakeSupabase(),
      't1',
      donnees({
        menuItems: [{ name: 'Poulet', category: 'Plats' }],
      } as Partial<OnboardingCompleteData>),
    );

    expect(loggerError).toHaveBeenCalled();
    expect(appels.some((a) => a.table === 'menu_items')).toBe(false);
  });
});

describe('slug rendu a l appelant', () => {
  it('prefere le slug relu en base', async () => {
    // C'est lui qui sert a rediriger vers la vitrine: un mauvais slug envoie le
    // restaurateur sur une page introuvable a la fin de son inscription.
    resultats['venues.select'] = [{ data: { id: 'v1' }, error: null }];
    // Deux lectures successives sur `tenants` avec un select simple: la garde
    // d'idempotence en entree, puis la relecture du slug en sortie. La file les
    // sert dans cet ordre.
    resultats['tenants.select'] = [
      { data: { onboarding_completed: false, slug: null }, error: null },
      { data: { slug: 'chez-amadou-2' }, error: null },
    ];

    const r = await completeOnboarding(fakeSupabase(), 't1', donnees());

    expect(r.slug).toBe('chez-amadou-2');
  });

  it('retombe sur le slug fourni quand la relecture ne rend rien', async () => {
    resultats['venues.select'] = [{ data: { id: 'v1' }, error: null }];

    const r = await completeOnboarding(fakeSupabase(), 't1', donnees());

    expect(r.slug).toBe('chez-amadou');
  });
});
