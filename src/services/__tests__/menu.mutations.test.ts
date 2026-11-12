import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMenu, updateMenu, deleteMenu, reorderMenus } from '../menu.mutations';
import { ServiceError } from '../errors';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// Le controle de doublon est teste a part (duplicate-name.test.ts).
vi.mock('../duplicate-name', () => ({ assertNameAvailable: vi.fn() }));

type QueryResult = {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  count?: number | null;
};

type Query = {
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  then: (onOk: (v: QueryResult) => unknown, onErr?: (e: unknown) => unknown) => Promise<unknown>;
};

/**
 * Chainable Supabase mock. Every builder method returns the same query object,
 * which is also awaitable (thenable) so the calls that do not end in .single()
 * - delete and reorder - resolve too.
 *
 * `results` is consumed one entry per from() call, so a reorder of N menus can
 * make the 3rd write fail and the others succeed.
 */
function mockSupabase(opts: { results?: QueryResult[]; rpc?: QueryResult } = {}) {
  const queries: Query[] = [];
  const results = opts.results ?? [];
  let call = 0;

  const from = vi.fn(() => {
    const result = results[call] ?? { data: { id: 'menu-1' }, error: null };
    call += 1;
    const q = {} as Query;
    const self = () => q;
    q.insert = vi.fn(self);
    q.update = vi.fn(self);
    q.delete = vi.fn(self);
    q.select = vi.fn(self);
    q.eq = vi.fn(self);
    q.single = vi.fn(async () => result);
    q.then = (onOk, onErr) => Promise.resolve(result).then(onOk, onErr);
    queries.push(q);
    return q;
  });

  const rpc = vi.fn(async () => opts.rpc ?? { data: 'carte-du-jour', error: null });

  return { client: { from, rpc } as unknown as SupabaseClient, from, rpc, queries };
}

const input = {
  name: 'Carte du jour',
  is_active: true,
  is_transversal_menu: false,
  display_order: 0,
};

describe('menu.mutations createMenu', () => {
  it('stamps the caller tenant on the row and uses the slug the database generated', async () => {
    const { client, rpc, queries } = mockSupabase({ rpc: { data: 'carte-du-jour', error: null } });

    await createMenu(client, 'tenant-1', input);

    expect(rpc).toHaveBeenCalledWith('generate_menu_slug', {
      p_tenant_id: 'tenant-1',
      p_name: 'Carte du jour',
    });
    const row = queries[0]!.insert.mock.calls[0]![0] as Record<string, unknown>;
    expect(row.tenant_id).toBe('tenant-1');
    expect(row.slug).toBe('carte-du-jour');
  });

  it('still creates the menu when slug generation fails, with a slug derived from the name', async () => {
    const { client, queries } = mockSupabase({
      rpc: { data: null, error: { message: 'rpc down' } },
    });

    await createMenu(client, 'tenant-1', input);

    const row = queries[0]!.insert.mock.calls[0]![0] as Record<string, unknown>;
    // Fallback carries a timestamp suffix, so match the stem only.
    expect(String(row.slug)).toMatch(/^carte-du-jour-\d+$/);
    expect(row.tenant_id).toBe('tenant-1');
  });

  it('falls back to "carte" when the name holds no slug-able character', async () => {
    const { client, queries } = mockSupabase({
      rpc: { data: null, error: { message: 'rpc down' } },
    });

    await createMenu(client, 'tenant-1', { ...input, name: '!!!' });

    // Without this guard the slug would be an empty string, and two such menus
    // would collide on the unique index.
    expect(String(queries[0]!.insert.mock.calls[0]![0].slug)).toMatch(/^carte-\d+$/);
  });

  it('turns empty optional strings into null rather than storing ""', async () => {
    const { client, queries } = mockSupabase();

    await createMenu(client, 'tenant-1', {
      ...input,
      name_en: '',
      description: '',
      venue_id: null,
      image_url: '',
    });

    const row = queries[0]!.insert.mock.calls[0]![0] as Record<string, unknown>;
    expect(row.name_en).toBeNull();
    expect(row.description).toBeNull();
    expect(row.venue_id).toBeNull();
    expect(row.image_url).toBeNull();
  });

  it('keeps is_active false instead of defaulting it back to true', async () => {
    const { client, queries } = mockSupabase();

    await createMenu(client, 'tenant-1', { ...input, is_active: false });

    // A carte switched off must not come back on: ?? must be used, not ||.
    expect(queries[0]!.insert.mock.calls[0]![0].is_active).toBe(false);
  });

  it('raises an INTERNAL ServiceError when the insert fails', async () => {
    const { client } = mockSupabase({ results: [{ data: null, error: { message: 'insert ko' } }] });

    await expect(createMenu(client, 'tenant-1', input)).rejects.toBeInstanceOf(ServiceError);
  });

  it('raises an INTERNAL ServiceError when the insert fails on the fallback path too', async () => {
    const { client } = mockSupabase({
      rpc: { data: null, error: { message: 'rpc down' } },
      results: [{ data: null, error: { message: 'insert ko' } }],
    });

    await expect(createMenu(client, 'tenant-1', input)).rejects.toMatchObject({
      code: 'INTERNAL',
    });
  });
});

describe('menu.mutations updateMenu', () => {
  it('filters on the tenant as well as the id, so one restaurant cannot edit another menu', async () => {
    const { client, queries } = mockSupabase();

    await updateMenu(client, 'tenant-1', { id: 'menu-1', name: 'Nouvelle carte' });

    expect(queries[0]!.eq).toHaveBeenCalledWith('id', 'menu-1');
    expect(queries[0]!.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
  });

  it('writes only the fields provided, leaving the rest untouched', async () => {
    const { client, queries } = mockSupabase();

    await updateMenu(client, 'tenant-1', { id: 'menu-1', display_order: 3 });

    const payload = queries[0]!.update.mock.calls[0]![0] as Record<string, unknown>;
    expect(Object.keys(payload)).toEqual(['display_order']);
    expect(payload).not.toHaveProperty('name');
    expect(payload).not.toHaveProperty('is_active');
  });

  it('keeps the slug when the menu is renamed, so printed QR codes still work', async () => {
    const { client, rpc, queries } = mockSupabase({ rpc: { data: 'nouvelle-carte', error: null } });

    await updateMenu(client, 'tenant-1', { id: 'menu-1', name: 'Nouvelle carte' });

    expect(rpc).not.toHaveBeenCalled();
    const payload = queries[0]!.update.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.name).toBe('Nouvelle carte');
    expect(payload).not.toHaveProperty('slug');
  });

  it('does not touch the slug when the name is not part of the update', async () => {
    const { client, rpc, queries } = mockSupabase();

    await updateMenu(client, 'tenant-1', { id: 'menu-1', is_active: false });

    // Re-slugging on an unrelated save would break every QR code already printed.
    expect(rpc).not.toHaveBeenCalled();
    expect(queries[0]!.update.mock.calls[0]![0]).not.toHaveProperty('slug');
  });

  it('writes false and 0 rather than skipping them', async () => {
    const { client, queries } = mockSupabase();

    await updateMenu(client, 'tenant-1', {
      id: 'menu-1',
      is_active: false,
      is_transversal_menu: false,
      display_order: 0,
    });

    const payload = queries[0]!.update.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).toHaveProperty('is_active', false);
    expect(payload).toHaveProperty('is_transversal_menu', false);
    expect(payload).toHaveProperty('display_order', 0);
  });

  it('clears an unlinked venue or parent menu to null, not to an empty string', async () => {
    const { client, queries } = mockSupabase();

    await updateMenu(client, 'tenant-1', {
      id: 'menu-1',
      venue_id: null,
      parent_menu_id: null,
      image_url: '',
    });

    const payload = queries[0]!.update.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).toHaveProperty('venue_id', null);
    expect(payload).toHaveProperty('parent_menu_id', null);
    expect(payload).toHaveProperty('image_url', null);
  });

  it('raises an INTERNAL ServiceError when the update fails', async () => {
    const { client } = mockSupabase({ results: [{ data: null, error: { message: 'update ko' } }] });

    await expect(
      updateMenu(client, 'tenant-1', { id: 'menu-1', name: 'Nouvelle carte' }),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
  });

  // `.single()` sur zero ligne rend PGRST116. Ce n'est pas une panne: c'est que
  // la carte n'existe pas, ou qu'elle appartient a un autre restaurant - le
  // filtre porte sur id ET tenant_id. Les confondre donnait un 500 et un message
  // "erreur serveur", qui envoie chercher une panne inexistante.
  it('rend NOT_FOUND et non INTERNAL quand la carte n existe pas (PGRST116)', async () => {
    const { client } = mockSupabase({
      results: [
        { data: null, error: { message: 'JSON object requested, 0 rows', code: 'PGRST116' } },
      ],
    });

    await expect(
      updateMenu(client, 'tenant-1', { id: 'inconnu', name: 'Nouvelle carte' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // NON-REGRESSION: une VRAIE panne doit rester INTERNAL. Sans ce cas, on
  // pourrait "corriger" en transformant toute erreur en NOT_FOUND, ce qui
  // masquerait les pannes au lieu de les signaler.
  it('garde INTERNAL pour une erreur de base qui n est PAS un PGRST116', async () => {
    const { client } = mockSupabase({
      results: [{ data: null, error: { message: 'deadlock detected', code: '40P01' } }],
    });

    await expect(
      updateMenu(client, 'tenant-1', { id: 'menu-1', name: 'Nouvelle carte' }),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
  });
});

describe('menu.mutations deleteMenu', () => {
  it('scopes the delete to the caller tenant', async () => {
    const { client, from, queries } = mockSupabase({ results: [{ error: null }] });

    await deleteMenu(client, 'menu-1', 'tenant-1');

    expect(from).toHaveBeenCalledWith('menus');
    expect(queries[0]!.delete).toHaveBeenCalled();
    expect(queries[0]!.eq).toHaveBeenCalledWith('id', 'menu-1');
    expect(queries[0]!.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
  });

  it('raises an INTERNAL ServiceError when the delete fails', async () => {
    const { client } = mockSupabase({ results: [{ error: { message: 'delete ko' } }] });

    await expect(deleteMenu(client, 'menu-1', 'tenant-1')).rejects.toMatchObject({
      code: 'INTERNAL',
    });
  });

  // Un DELETE qui ne correspond a RIEN ne rend aucune erreur. Sans compter les
  // lignes touchees, supprimer une carte inexistante - ou appartenant a un AUTRE
  // restaurant, puisque le filtre porte aussi sur tenant_id - repondait "succes".
  // L'interface annoncait une suppression qui n'avait pas eu lieu, et le journal
  // d'audit enregistrait un geste qui ne s'etait pas produit.
  it('refuse de rendre un succes quand AUCUNE ligne n a ete supprimee', async () => {
    const { client } = mockSupabase({ results: [{ error: null, count: 0 }] });

    await expect(deleteMenu(client, 'inconnu', 'tenant-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('demande bien a Postgres de compter les lignes supprimees', async () => {
    const { client, queries } = mockSupabase({ results: [{ error: null, count: 1 }] });

    await deleteMenu(client, 'menu-1', 'tenant-1');

    // Sans `count: 'exact'`, le compte revient undefined et la garde ci-dessus
    // ne protege plus rien: elle passerait sur toutes les suppressions.
    expect(queries[0]!.delete).toHaveBeenCalledWith({ count: 'exact' });
  });

  it('supprime normalement quand une ligne est bien touchee', async () => {
    const { client } = mockSupabase({ results: [{ error: null, count: 1 }] });

    await expect(deleteMenu(client, 'menu-1', 'tenant-1')).resolves.toBeUndefined();
  });
});

describe('menu.mutations reorderMenus', () => {
  it('writes the position of each menu as its rank in the list', async () => {
    const { client, queries } = mockSupabase({
      results: [{ error: null }, { error: null }, { error: null }],
    });

    await reorderMenus(client, 'tenant-1', ['menu-c', 'menu-a', 'menu-b']);

    expect(queries).toHaveLength(3);
    expect(queries[0]!.update).toHaveBeenCalledWith({ display_order: 0 });
    expect(queries[1]!.update).toHaveBeenCalledWith({ display_order: 1 });
    expect(queries[2]!.update).toHaveBeenCalledWith({ display_order: 2 });
    expect(queries[0]!.eq).toHaveBeenCalledWith('id', 'menu-c');
    expect(queries[2]!.eq).toHaveBeenCalledWith('id', 'menu-b');
  });

  it('scopes every write to the caller tenant', async () => {
    const { client, queries } = mockSupabase({ results: [{ error: null }, { error: null }] });

    await reorderMenus(client, 'tenant-1', ['menu-a', 'menu-b']);

    for (const q of queries) {
      expect(q.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    }
  });

  it('reports a failure even when it is not the first write', async () => {
    const { client } = mockSupabase({
      results: [{ error: null }, { error: { message: 'row locked' } }, { error: null }],
    });

    await expect(
      reorderMenus(client, 'tenant-1', ['menu-a', 'menu-b', 'menu-c']),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
  });

  it('does nothing and succeeds on an empty list', async () => {
    const { client, from } = mockSupabase();

    await expect(reorderMenus(client, 'tenant-1', [])).resolves.toBeUndefined();
    expect(from).not.toHaveBeenCalled();
  });
});

describe('menu.mutations createMenu - doublon', () => {
  it('refuse un nom deja pris sans rien inserer', async () => {
    const { assertNameAvailable } = await import('../duplicate-name');
    vi.mocked(assertNameAvailable).mockRejectedValueOnce(
      new ServiceError('Une carte porte deja ce nom.', 'VALIDATION'),
    );
    const from = vi.fn();
    await expect(
      createMenu({ from } as unknown as SupabaseClient, 'tenant-A', {
        name: 'Carte',
        is_active: true,
        is_transversal_menu: false,
        display_order: 0,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(from).not.toHaveBeenCalled();
  });
});
