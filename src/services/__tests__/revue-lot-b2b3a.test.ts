/**
 * Revue ligne par ligne, lot B2b-3a (constats de gravite Basse: catalogue,
 * stock, commandes). Chaque test porte un temoin: il echoue sur le code d'avant
 * la correction (succes annonce, erreur avalee, message brut...).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCategoryService } from '../category.service';
import { createCouponService } from '../coupon.service';
import { createInventoryService } from '../inventory.service';
import { createMenuService } from '../menu.service';
import { updateMenu } from '../menu.mutations';
import { createQueryMethods } from '../order/order-queries';
import { createValidationMethods } from '../order/order-validation';
import { createQrDesignService } from '../qr-design.service';
import { createSuggestionService, generateAndSaveSuggestions } from '../suggestion.service';
import { createTableConfigService } from '../table-config.service';
import { ServiceError } from '../errors';
import {
  categoryCreateSchema,
  categoryReorderSchema,
  categoryUpdateSchema,
} from '@/lib/validations/category.schema';
import { reorderMenusSchema } from '@/lib/validations/menu.schema';

const logged = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: logged }));

type Res = {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  count?: number | null;
};

/**
 * Supabase double: each `from(table)` takes the next queued result for that
 * table; every builder call is recorded. The builder is awaitable.
 */
function fakeDb(results: Record<string, Res[]> = {}, rpcResult?: Res) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const used: Record<string, number> = {};
  const from = vi.fn((table: string) => {
    const i = used[table] ?? 0;
    used[table] = i + 1;
    const list = results[table] ?? [];
    const res = list[i] ?? list[list.length - 1] ?? { data: [], error: null };
    const b: Record<string, unknown> = {};
    for (const m of [
      'select',
      'insert',
      'update',
      'delete',
      'eq',
      'neq',
      'is',
      'in',
      'ilike',
      'like',
      'gte',
      'order',
      'limit',
    ]) {
      b[m] = vi.fn((...args: unknown[]) => {
        calls.push({ table, method: m, args });
        return b;
      });
    }
    b.maybeSingle = vi.fn(async () => res);
    b.single = vi.fn(async () => res);
    b.then = (ok: (v: Res) => unknown, ko?: (e: unknown) => unknown) =>
      Promise.resolve(res).then(ok, ko);
    return b;
  });
  const rpc = vi.fn(async () => rpcResult ?? { data: null, error: null });
  return { client: { from, rpc } as unknown as SupabaseClient, calls, from, rpc };
}

const T = 'tenant-a';
const SECRET = 'relation "public.secret_table" permission denied';

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// --- B32 / B34: categories ------------------------------------------------

describe('B32: reordonnancement des categories en une ecriture atomique', () => {
  it('une ligne manquante (P0002) est un conflit, pas un succes', async () => {
    const { client } = fakeDb({}, { data: null, error: { message: 'x', code: 'P0002' } });
    await expect(
      createCategoryService(client).reorderCategories(T, [{ id: 'c1', display_order: 0 }]),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('une panne est INTERNAL et n ecrit rien ligne par ligne', async () => {
    const { client, from } = fakeDb({}, { data: null, error: { message: SECRET } });
    const err = await createCategoryService(client)
      .reorderCategories(T, [{ id: 'c1', display_order: 0 }])
      .catch((e: unknown) => e);
    expect((err as ServiceError).code).toBe('INTERNAL');
    expect((err as ServiceError).message).not.toContain('secret_table');
    expect(from).not.toHaveBeenCalled();
  });

  it('temoin: liste vide -> aucun appel', async () => {
    const { client, rpc } = fakeDb();
    await createCategoryService(client).reorderCategories(T, []);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('B34: isCategoryLinkedToMenu (mort) est supprime', () => {
  it('n est plus expose par le service', () => {
    const svc = createCategoryService(fakeDb().client);
    expect('isCategoryLinkedToMenu' in svc).toBe(false);
    expect(typeof svc.reorderCategories).toBe('function');
  });
});

// --- B33: renommage sans doublon ------------------------------------------

describe('B33: renommer une categorie refuse un doublon', () => {
  const input = { name: 'Boissons', tenant_id: T, menu_id: 'menu-1' };

  it('un autre nom identique dans la carte -> refus, rien ecrit', async () => {
    const { client, calls } = fakeDb({ categories: [{ data: [{ id: 'cat-2' }], error: null }] });
    await expect(
      createCategoryService(client).updateCategory('cat-1', input),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(calls).toContainEqual({ table: 'categories', method: 'neq', args: ['id', 'cat-1'] });
    expect(calls.some((c) => c.method === 'update')).toBe(false);
  });

  it('temoin: nom libre -> mise a jour comptee', async () => {
    const { client, calls } = fakeDb({
      categories: [
        { data: [], error: null },
        { error: null, count: 1 },
      ],
    });
    await createCategoryService(client).updateCategory('cat-1', input);
    const update = calls.find((c) => c.method === 'update');
    expect(update?.args[1]).toEqual({ count: 'exact' });
  });

  it('categorie supprimee entre-temps (0 ligne) -> introuvable', async () => {
    const { client } = fakeDb({
      categories: [
        { data: [], error: null },
        { error: null, count: 0 },
      ],
    });
    await expect(
      createCategoryService(client).updateCategory('cat-1', input),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('B33: renommer une carte refuse un doublon', () => {
  it('un autre nom identique dans le restaurant -> refus, rien ecrit', async () => {
    const { client, calls } = fakeDb({ menus: [{ data: [{ id: 'menu-2' }], error: null }] });
    await expect(updateMenu(client, T, { id: 'menu-1', name: 'Midi' })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    expect(calls).toContainEqual({ table: 'menus', method: 'neq', args: ['id', 'menu-1'] });
    expect(calls.some((c) => c.method === 'update')).toBe(false);
  });

  it('temoin: une activation sans nom ne lance aucun controle de doublon', async () => {
    const { client, calls } = fakeDb({ menus: [{ data: { id: 'menu-1' }, error: null }] });
    await updateMenu(client, T, { id: 'menu-1', is_active: false });
    expect(calls.some((c) => c.method === 'ilike')).toBe(false);
  });
});

// --- B36: coupons ---------------------------------------------------------

describe('B36: modifier un coupon disparu n annonce plus de succes', () => {
  const payload = { code: 'promo', discount_type: 'fixed' as const, discount_value: 500 };

  it('0 ligne touchee -> introuvable', async () => {
    const { client } = fakeDb({ coupons: [{ error: null, count: 0 }] });
    await expect(
      createCouponService(client).updateCoupon('cp-1', T, payload),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('temoin: 1 ligne touchee -> succes, avec count exact demande', async () => {
    const { client, calls } = fakeDb({ coupons: [{ error: null, count: 1 }] });
    await createCouponService(client).updateCoupon('cp-1', T, payload);
    expect(calls.find((c) => c.method === 'update')?.args[1]).toEqual({ count: 'exact' });
  });
});

// --- B41: Zod sur les rubriques -------------------------------------------

describe('B41: validation des rubriques et du reordonnancement', () => {
  it('refuse un nom fait d espaces, un rang decimal ou negatif, une zone inconnue', () => {
    expect(categoryCreateSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(categoryCreateSchema.safeParse({ name: 'A', display_order: 1.5 }).success).toBe(false);
    expect(categoryCreateSchema.safeParse({ name: 'A', display_order: -1 }).success).toBe(false);
    expect(categoryCreateSchema.safeParse({ name: 'A', preparation_zone: 'cave' }).success).toBe(
      false,
    );
  });

  it('temoin: un formulaire normal passe (nom rogne)', () => {
    const r = categoryCreateSchema.safeParse({
      name: '  Plats ',
      display_order: 3,
      preparation_zone: 'bar',
      menu_id: null,
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.name).toBe('Plats');
  });

  it('la modification exige la carte (null permis)', () => {
    expect(categoryUpdateSchema.safeParse({ name: 'A' }).success).toBe(false);
    expect(categoryUpdateSchema.safeParse({ name: 'A', menu_id: null }).success).toBe(true);
  });

  it('reordonnancement: 501 lignes, doublon ou rang decimal refuses', () => {
    const row = (i: number) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      display_order: i,
    });
    expect(
      categoryReorderSchema.safeParse(Array.from({ length: 501 }, (_, i) => row(i))).success,
    ).toBe(false);
    expect(categoryReorderSchema.safeParse([row(1), row(1)]).success).toBe(false);
    expect(categoryReorderSchema.safeParse([{ ...row(1), display_order: 0.5 }]).success).toBe(
      false,
    );
    expect(
      categoryReorderSchema.safeParse(Array.from({ length: 500 }, (_, i) => row(i))).success,
    ).toBe(true);
  });
});

// --- B52: inventaire ------------------------------------------------------

describe('B52: inventaire, methodes mortes et erreur de lecture du plat', () => {
  it('les 4 methodes mortes et setOpeningStock ne sont plus exposees', () => {
    const svc = createInventoryService(fakeDb().client);
    for (const name of [
      'getIngredients',
      'verifyLedger',
      'reconcileLedger',
      'getStockMovements',
      'setOpeningStock',
    ]) {
      expect(name in svc).toBe(false);
    }
  });

  it('lecture du plat en echec -> INTERNAL, pas "article non trouve"', async () => {
    const { client } = fakeDb({ menu_items: [{ data: null, error: { message: 'timeout' } }] });
    await expect(createInventoryService(client).getRecipesForItem('mi-1', T)).rejects.toMatchObject(
      { code: 'INTERNAL' },
    );
    await expect(createInventoryService(client).setRecipe(T, 'mi-1', [])).rejects.toMatchObject({
      code: 'INTERNAL',
    });
  });

  it('temoin: plat absent sans erreur -> NOT_FOUND', async () => {
    const { client } = fakeDb({ menu_items: [{ data: null, error: null }] });
    await expect(createInventoryService(client).getRecipesForItem('mi-1', T)).rejects.toMatchObject(
      { code: 'NOT_FOUND' },
    );
  });
});

// --- B55 / B56: cartes ----------------------------------------------------

describe('B55: les 8 lectures mortes du service des cartes sont supprimees', () => {
  it('le service n expose que les 4 ecritures', () => {
    expect(Object.keys(createMenuService(fakeDb().client)).sort()).toEqual([
      'createMenu',
      'deleteMenu',
      'reorderMenus',
      'updateMenu',
    ]);
  });
});

describe('B56: reordonnancement des cartes valide par Zod', () => {
  const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  it('refuse doublon, identifiant invalide et plus de 500 cartes', () => {
    expect(reorderMenusSchema.safeParse([id(1), id(1)]).success).toBe(false);
    expect(reorderMenusSchema.safeParse(['pas-un-uuid']).success).toBe(false);
    expect(reorderMenusSchema.safeParse(Array.from({ length: 501 }, (_, i) => id(i))).success).toBe(
      false,
    );
  });
  it('temoin: une liste normale passe', () => {
    expect(reorderMenusSchema.safeParse([id(1), id(2)]).success).toBe(true);
  });
});

// --- B69 / B70: commandes -------------------------------------------------

describe('B69: une commande prete avant minuit reste "a servir" apres minuit', () => {
  it('fenetre glissante de 24 h, pas depuis minuit', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T00:10:00.000Z'));
    const { client, calls } = fakeDb({ orders: [{ data: [], error: null }] });
    await createQueryMethods(client).listReadyOrdersToday(T);
    const gte = calls.find((c) => c.method === 'gte');
    expect(gte?.args).toEqual(['created_at', '2026-11-23T00:10:00.000Z']);
  });
});

describe('B70: erreur de lecture des categories dans determinePreparationZone', () => {
  it('erreur -> commande mixte, chaque rubrique sur les deux ecrans, journalisee', async () => {
    const { client } = fakeDb({ categories: [{ data: null, error: { message: 'timeout' } }] });
    const res = await createValidationMethods(client).determinePreparationZone(T, ['c-bar']);
    expect(res.orderZone).toBe('mixed');
    expect(res.categoryZoneMap.get('c-bar')).toBe('both');
    expect(logged.error).toHaveBeenCalled();
  });

  it('temoin: lecture reussie de rubriques bar -> commande bar', async () => {
    const { client } = fakeDb({
      categories: [{ data: [{ id: 'c-bar', preparation_zone: 'bar' }], error: null }],
    });
    const res = await createValidationMethods(client).determinePreparationZone(T, ['c-bar']);
    expect(res.orderZone).toBe('bar');
    expect(res.categoryZoneMap.get('c-bar')).toBe('bar');
  });
});

// --- B81: design QR -------------------------------------------------------

describe('B81: le design par defaut ne retombe plus en silence sur celui d usine', () => {
  it('lecture du restaurant en echec -> INTERNAL', async () => {
    const { client } = fakeDb({ tenants: [{ data: null, error: { message: 'timeout' } }] });
    await expect(
      createQrDesignService(client).resolveDesignsForTables(T, ['t1']),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
  });

  it('lecture du design par defaut en echec -> INTERNAL', async () => {
    const { client } = fakeDb({
      tenants: [{ data: { primary_color: '#112233' }, error: null }],
      qr_designs: [{ data: null, error: { message: 'timeout' } }],
    });
    await expect(
      createQrDesignService(client).resolveDesignsForTables(T, ['t1']),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
  });

  it('temoin: aucune erreur, aucun design -> design d usine', async () => {
    const { client } = fakeDb({
      tenants: [{ data: { primary_color: '#112233' }, error: null }],
      qr_designs: [{ data: null, error: null }],
      tables: [{ data: [], error: null }],
    });
    const res = await createQrDesignService(client).resolveDesignsForTables(T, ['t1']);
    expect(res.t1).toBeDefined();
  });
});

// --- B96 / B97: suggestions -----------------------------------------------

describe('B96: lecture des plats en echec n est plus "0 suggestion generee"', () => {
  it('erreur -> ServiceError, aucune regeneration', async () => {
    const { client, rpc } = fakeDb({ menu_items: [{ data: null, error: { message: SECRET } }] });
    const err = await generateAndSaveSuggestions(client, T).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServiceError);
    expect((err as ServiceError).message).not.toContain('secret_table');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('temoin: carte vide lue sans erreur -> 0', async () => {
    const { client } = fakeDb({ menu_items: [{ data: [], error: null }] });
    await expect(generateAndSaveSuggestions(client, T)).resolves.toBe(0);
  });
});

describe('B97: doublon de suggestion par envois simultanes', () => {
  const input = {
    tenant_id: T,
    menu_item_id: 'mi-1',
    suggested_item_id: 'mi-2',
    suggestion_type: 'upsell' as const,
    display_order: 0,
  };

  it('l index unique refuse le second envoi (23505) -> conflit lisible', async () => {
    const { client } = fakeDb({
      item_suggestions: [
        { data: [], error: null },
        { error: { message: 'duplicate key', code: '23505' } },
      ],
    });
    await expect(createSuggestionService(client).createSuggestion(input)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Cette suggestion existe déjà.',
    });
  });

  it('lecture anti-doublon en echec -> INTERNAL, rien insere', async () => {
    const { client, calls } = fakeDb({
      item_suggestions: [{ data: null, error: { message: 'timeout' } }],
    });
    await expect(createSuggestionService(client).createSuggestion(input)).rejects.toMatchObject({
      code: 'INTERNAL',
    });
    expect(calls.some((c) => c.method === 'insert')).toBe(false);
  });

  it('temoin: paire libre -> insertion', async () => {
    const { client, calls } = fakeDb({
      item_suggestions: [{ data: [], error: null }, { error: null }],
    });
    await createSuggestionService(client).createSuggestion(input);
    expect(calls.some((c) => c.method === 'insert')).toBe(true);
  });
});

// --- B106 / B66: zones et tables ------------------------------------------

describe('B106: ajout de tables, lecture des numeros existants', () => {
  const zoneOwned = { data: { venue: { tenant_id: T } }, error: null };

  it('lecture en echec -> INTERNAL, rien insere (ne repart pas a 1)', async () => {
    const { client, calls } = fakeDb({
      zones: [zoneOwned],
      tables: [{ data: null, error: { message: SECRET } }],
    });
    const err = await createTableConfigService(client)
      .addTablesToZone(T, 'z1', 'INT', 2)
      .catch((e: unknown) => e);
    expect((err as ServiceError).code).toBe('INTERNAL');
    expect((err as ServiceError).message).not.toContain('secret_table');
    expect(calls.some((c) => c.method === 'insert')).toBe(false);
  });

  it('temoin: la lecture est bornee au restaurant et la numerotation continue', async () => {
    const { client, calls } = fakeDb({
      zones: [zoneOwned],
      tables: [
        { data: [{ table_number: 'INT-4' }], error: null },
        { data: [{ id: 't5', table_number: 'INT-5' }], error: null },
      ],
    });
    await createTableConfigService(client).addTablesToZone(T, 'z1', 'INT', 1);
    expect(calls).toContainEqual({ table: 'tables', method: 'eq', args: ['tenant_id', T] });
    const insert = calls.find((c) => c.method === 'insert');
    expect((insert?.args[0] as Array<{ table_number: string }>)[0].table_number).toBe('INT-5');
  });
});

describe('B66: aucun message Postgres brut vers le navigateur (zones et tables)', () => {
  const tableOwned = { data: { zone: { venue: { tenant_id: T } } }, error: null };

  it('mise a jour de table en echec -> message fixe, detail journalise', async () => {
    const { client } = fakeDb({
      tables: [tableOwned, { error: { message: SECRET } }],
    });
    const err = await createTableConfigService(client)
      .toggleTableActive(T, 't1', false)
      .catch((e: unknown) => e);
    expect((err as ServiceError).message).toBe('Erreur mise a jour table');
    expect(logged.error).toHaveBeenCalledWith(
      'Erreur mise a jour table',
      expect.objectContaining({ error: SECRET }),
    );
  });

  it('verification d appartenance en echec -> message fixe', async () => {
    const { client } = fakeDb({ tables: [{ data: null, error: { message: SECRET } }] });
    const err = await createTableConfigService(client)
      .toggleTableActive(T, 't1', false)
      .catch((e: unknown) => e);
    expect((err as ServiceError).message).toBe('Erreur verification table');
  });

  it('temoin: un doublon (23505) garde son message metier', async () => {
    const { client } = fakeDb({
      tables: [tableOwned, { error: { message: SECRET, code: '23505' } }],
    });
    await expect(
      createTableConfigService(client).updateTableDisplayName(T, 't1', 'T9'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
