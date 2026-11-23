import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMenu, updateMenu } from '../menu.mutations';

// Audit B24 (CRITIQUE): `parent_menu_id` et `venue_id` etaient ecrits sans
// verifier qu'ils appartiennent au restaurant. L'admin du restaurant A pouvait
// accrocher une carte a une carte de B et la faire apparaitre dans la vitrine
// de B. Le service refuse desormais un lien vers un autre restaurant et une
// carte qui serait son propre parent (la base le refuse aussi: declencheur
// 20261123100000, test pgTAP menus_meme_restaurant).

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('../duplicate-name', () => ({ assertNameAvailable: vi.fn() }));

const T = 'tenant-A';
const PARENT = '22222222-2222-4222-8222-222222222222';
const VENUE = '33333333-3333-4333-8333-333333333333';
const SELF = '44444444-4444-4444-8444-444444444444';

/**
 * `owned` = ce que la lecture filtree (`id` + `tenant_id`) trouve, par table.
 * Toute ecriture menus est journalisee dans `writes`.
 */
function mockSupabase(owned: { menus?: boolean; venues?: boolean }) {
  const writes: string[] = [];
  const lookups: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  const from = vi.fn((table: string) => {
    const filters: Array<[string, unknown]> = [];
    const q: Record<string, unknown> = {};
    q.select = vi.fn(() => q);
    q.eq = vi.fn((col: string, val: unknown) => {
      filters.push([col, val]);
      return q;
    });
    q.insert = vi.fn(() => {
      writes.push('insert');
      return q;
    });
    q.update = vi.fn(() => {
      writes.push('update');
      return q;
    });
    q.maybeSingle = vi.fn(async () => {
      lookups.push({ table, filters });
      const found = table === 'menus' ? owned.menus : owned.venues;
      return { data: found ? { id: 'x' } : null, error: null };
    });
    q.single = vi.fn(async () => ({ data: { id: SELF }, error: null }));
    return q;
  });
  const rpc = vi.fn(async () => ({ data: 'carte', error: null }));
  return { client: { from, rpc } as unknown as SupabaseClient, writes, lookups };
}

const base = { name: 'Sous-carte', is_active: true, is_transversal_menu: false, display_order: 0 };

describe('menu.mutations - liens vers un autre restaurant (B24)', () => {
  it('createMenu refuse un parent_menu_id d un autre restaurant, sans rien ecrire', async () => {
    const { client, writes, lookups } = mockSupabase({ menus: false, venues: true });
    await expect(createMenu(client, T, { ...base, parent_menu_id: PARENT })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    expect(writes).toEqual([]);
    expect(lookups[0]).toEqual({
      table: 'menus',
      filters: [
        ['id', PARENT],
        ['tenant_id', T],
      ],
    });
  });

  it('createMenu refuse un venue_id d un autre restaurant', async () => {
    const { client, writes } = mockSupabase({ menus: true, venues: false });
    await expect(createMenu(client, T, { ...base, venue_id: VENUE })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    expect(writes).toEqual([]);
  });

  it('updateMenu refuse un parent d un autre restaurant', async () => {
    const { client, writes } = mockSupabase({ menus: false, venues: true });
    await expect(updateMenu(client, T, { id: SELF, parent_menu_id: PARENT })).rejects.toMatchObject(
      { code: 'VALIDATION' },
    );
    expect(writes).toEqual([]);
  });

  it('updateMenu refuse une carte qui serait son propre parent', async () => {
    const { client, writes } = mockSupabase({ menus: true, venues: true });
    await expect(updateMenu(client, T, { id: SELF, parent_menu_id: SELF })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    expect(writes).toEqual([]);
  });

  it('temoin: liens du meme restaurant acceptes', async () => {
    const { client, writes } = mockSupabase({ menus: true, venues: true });
    await createMenu(client, T, { ...base, parent_menu_id: PARENT, venue_id: VENUE });
    await updateMenu(client, T, { id: SELF, parent_menu_id: PARENT, venue_id: VENUE });
    expect(writes).toEqual(['insert', 'update']);
  });

  it('temoin: detacher (null) ne demande aucune verification', async () => {
    const { client, writes, lookups } = mockSupabase({ menus: false, venues: false });
    await updateMenu(client, T, { id: SELF, parent_menu_id: null, venue_id: null });
    expect(lookups).toEqual([]);
    expect(writes).toEqual(['update']);
  });
});
