import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Minimal table-aware Supabase double for the recipe import: every query is a
 * chainable, awaitable builder that resolves to the rows given for its table.
 * Records the RPC calls and the DELETE filters so tests can assert on writes.
 */
export interface RecipeDbFixture {
  categories?: Array<{ id: string; name: string; display_order: number | null }>;
  menu_items?: Array<{ id: string; name: string; category_id?: string | null }>;
  ingredients?: Array<{
    id: string;
    name: string;
    unit: string;
    is_active?: boolean;
    created_at?: string;
  }>;
  recipes?: Array<{
    menu_item_id: string;
    ingredient_id: string;
    quantity_needed: number;
    notes: string | null;
  }>;
  rpcResult?: { data: unknown; error: unknown };
}

export function makeRecipeDb(fx: RecipeDbFixture = {}) {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const deletes: Array<Record<string, unknown>> = [];

  const rowsFor = (table: string): unknown[] => {
    if (table === 'recipes') {
      // The export embeds ingredient:ingredients(name, unit).
      return (fx.recipes ?? []).map((r) => {
        const ing = (fx.ingredients ?? []).find((i) => i.id === r.ingredient_id);
        return { ...r, ingredient: ing ? { name: ing.name, unit: ing.unit } : null };
      });
    }
    const map: Record<string, unknown[] | undefined> = {
      categories: fx.categories,
      menu_items: (fx.menu_items ?? []).map((m) => ({ category_id: null, ...m })),
      ingredients: (fx.ingredients ?? []).map((i) => ({ is_active: true, created_at: '', ...i })),
      tenants: [{ slug: 'demo' }],
    };
    return map[table] ?? [];
  };

  const from = vi.fn((table: string) => {
    let isDelete = false;
    const filters: Record<string, unknown> = {};
    const builder = {
      select: () => builder,
      delete: () => {
        isDelete = true;
        return builder;
      },
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return builder;
      },
      is: () => builder,
      maybeSingle: () => Promise.resolve({ data: rowsFor(table)[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => {
        if (isDelete) {
          deletes.push({ table, ...filters });
          return Promise.resolve({ data: null, error: null, count: 1 }).then(resolve);
        }
        return Promise.resolve({ data: rowsFor(table), error: null }).then(resolve);
      },
    };
    return builder;
  });

  const rpc = vi.fn((fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    return Promise.resolve(
      fx.rpcResult ?? {
        data: { recipes_created: 1, recipes_updated: 0, ingredients_created: 1 },
        error: null,
      },
    );
  });

  return { supabase: { from, rpc } as unknown as SupabaseClient, rpcCalls, deletes };
}

export function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
