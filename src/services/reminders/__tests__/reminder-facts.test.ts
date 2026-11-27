import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadCoachFacts, loadStockFacts } from '../reminder-facts';
import { coachFacts } from '../rules';

type Result = { data: unknown; error: unknown };

/** Fausse base: une reponse par table ou par fonction, filtres retenus. */
function fakeDb(byTable: Record<string, Result>, byRpc: Record<string, Result> = {}) {
  const filters: [string, string, string, unknown][] = [];
  const rpcArgs: Record<string, unknown> = {};
  const client = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'order', 'limit']) chain[m] = () => chain;
      for (const m of ['eq', 'in']) {
        chain[m] = (c: string, v: unknown) => (filters.push([table, m, c, v]), chain);
      }
      const result = () => byTable[table] ?? { data: [], error: null };
      chain.maybeSingle = async () => result();
      chain.then = (ok: (v: unknown) => unknown) => Promise.resolve(result()).then(ok);
      return chain;
    },
    async rpc(name: string, args: unknown) {
      rpcArgs[name] = args;
      return byRpc[name] ?? { data: [], error: null };
    },
  } as unknown as SupabaseClient;
  return { client, filters, rpcArgs };
}

describe('loadStockFacts (B87)', () => {
  const ingredients = {
    data: [
      { id: 'i1', name: 'Riz', current_stock: 0, min_stock_alert: 5 },
      { id: 'i2', name: 'Huile', current_stock: 2, min_stock_alert: 5 },
      { id: 'i3', name: 'Sel', current_stock: 10, min_stock_alert: 5 },
    ],
    error: null,
  };

  it('ne liste pas un plat SUPPRIME parmi les plats retires de la carte', async () => {
    const { client, filters } = fakeDb({
      ingredients,
      recipes: {
        data: [
          { menu_item: { name: 'Riz gras', is_available: false, deleted_at: null } },
          { menu_item: { name: 'Ancien plat', is_available: false, deleted_at: '2026-11-01' } },
          { menu_item: { name: 'Riz sauce', is_available: true, deleted_at: null } },
          { menu_item: { name: 'Riz gras', is_available: false, deleted_at: null } },
        ],
        error: null,
      },
    });

    const facts = await loadStockFacts(client, 't1');

    expect(facts).toEqual({ outOfStock: ['Riz'], low: ['Huile'], hiddenDishes: ['Riz gras'] });
    expect(filters).toContainEqual(['ingredients', 'eq', 'tenant_id', 't1']);
    expect(filters).toContainEqual(['recipes', 'eq', 'tenant_id', 't1']);
    expect(filters).toContainEqual(['recipes', 'in', 'ingredient_id', ['i1']]);
  });

  it('sans rupture, les recettes ne sont pas lues', async () => {
    const { client, filters } = fakeDb({
      ingredients: {
        data: [{ id: 'i3', name: 'Sel', current_stock: 10, min_stock_alert: 5 }],
        error: null,
      },
    });
    expect(await loadStockFacts(client, 't1')).toEqual({
      outOfStock: [],
      low: [],
      hiddenDishes: [],
    });
    expect(filters.some(([t]) => t === 'recipes')).toBe(false);
  });

  it('une erreur de lecture leve', async () => {
    const { client } = fakeDb({ ingredients: { data: null, error: { code: 'x' } } });
    await expect(loadStockFacts(client, 't1')).rejects.toEqual({ code: 'x' });
  });
});

describe('loadCoachFacts (B87)', () => {
  const NOW = new Date('2026-11-23T09:00:00Z');

  it('agrege en base sur 28 jours, filtre par restaurant, et convertit les nombres', async () => {
    const { client, filters, rpcArgs } = fakeDb(
      { orders: { data: { created_at: '2026-09-01T10:00:00Z' }, error: null } },
      {
        reminder_coach_slots: { data: [{ dow: '5', hour: '20', orders: '42' }], error: null },
        reminder_coach_items: { data: [], error: null },
      },
    );

    const facts = await loadCoachFacts(client, 't1', 'Africa/Ouagadougou', NOW);

    expect(filters).toContainEqual(['orders', 'eq', 'tenant_id', 't1']);
    expect(rpcArgs.reminder_coach_slots).toMatchObject({
      p_tenant_id: 't1',
      p_since: '2026-10-26T09:00:00.000Z',
      p_until: NOW.toISOString(),
      p_tz: 'Africa/Ouagadougou',
    });
    expect(rpcArgs.reminder_coach_items).toMatchObject({
      p_tenant_id: 't1',
      p_split: '2026-11-16T09:00:00.000Z',
    });
    // Les chaines rendues par Postgres sont converties en nombres avant le calcul.
    expect(facts).toEqual(
      coachFacts(
        {
          slots: [{ dow: 5, hour: 20, orders: 42 }],
          items: [],
          firstOrderAt: '2026-09-01T10:00:00Z',
        },
        NOW,
      ),
    );
  });

  it('une erreur de l une des trois lectures leve', async () => {
    const { client } = fakeDb(
      { orders: { data: null, error: null } },
      { reminder_coach_items: { data: null, error: { code: 'rpc' } } },
    );
    await expect(loadCoachFacts(client, 't1', 'UTC', NOW)).rejects.toEqual({ code: 'rpc' });
  });
});
