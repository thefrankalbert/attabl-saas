import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { bulkImportMenuRows, type MenuBulkImportRow } from '../menu-bulk-import';
import { isMissingDeletedAtColumnError } from '../menu-items-query';

/**
 * Colonnes reelles de public.menu_items (production, verifie le 2026-11-10).
 * PostgREST refuse TOUT le lot si une ligne porte une colonne inconnue
 * (PGRST204): l'ancien mock acceptait n'importe quoi, ce qui a laisse passer
 * `slug` et `display_order` et rendu l'import inoperant pendant des mois.
 */
const MENU_ITEM_COLUMNS = new Set([
  'tenant_id',
  'category_id',
  'name',
  'name_en',
  'description',
  'description_en',
  'price',
  'is_available',
  'is_featured',
]);

function unknownColumn(row: Record<string, unknown>): string | undefined {
  return Object.keys(row).find((k) => !MENU_ITEM_COLUMNS.has(k));
}

interface MockOptions {
  categories?: Array<{ id: string; name: string; display_order: number }>;
  items?: Array<{ id: string; category_id: string; name: string }>;
}

function createMock({ categories = [], items = [] }: MockOptions = {}) {
  const inserted: Record<string, unknown>[] = [];
  const updated: Array<{ id: string; patch: Record<string, unknown> }> = [];

  const from = vi.fn((table: string) => {
    if (table === 'categories') {
      return {
        select: () => ({ eq: () => ({ eq: async () => ({ data: categories, error: null }) }) }),
        insert: (rows: Array<{ name: string }>) => ({
          select: async () => ({
            data: rows.map((r, i) => ({ id: `new-cat-${i}`, name: r.name })),
            error: null,
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({ in: () => ({ is: async () => ({ data: items, error: null }) }) }),
      }),
      insert: async (rows: Record<string, unknown>[]) => {
        const bad = rows.map(unknownColumn).find(Boolean);
        if (bad) {
          return { error: { code: 'PGRST204', message: `Could not find the '${bad}' column` } };
        }
        inserted.push(...rows);
        return { error: null };
      },
      update: (patch: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => ({
          eq: async () => {
            const bad = unknownColumn(patch);
            if (bad) return { error: { code: 'PGRST204', message: bad } };
            updated.push({ id, patch });
            return { error: null };
          },
        }),
      }),
    };
  });

  return { supabase: { from } as unknown as SupabaseClient, inserted, updated };
}

function row(over: Partial<MenuBulkImportRow> & { rowKey: number; name: string }) {
  return {
    category: 'Plats',
    price: 1000,
    isAvailable: null,
    isFeatured: null,
    ...over,
  } as MenuBulkImportRow;
}

function group(items: MenuBulkImportRow[], category = 'Plats') {
  return new Map([[category, { categoryEn: null, items }]]);
}

describe('isMissingDeletedAtColumnError', () => {
  it('detects missing deleted_at column', () => {
    expect(isMissingDeletedAtColumnError({ code: '42703', message: 'column deleted_at' })).toBe(
      true,
    );
    expect(isMissingDeletedAtColumnError({ message: 'other' })).toBe(false);
  });
});

describe('bulkImportMenuRows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cree les plats avec les seules colonnes de la table et les valeurs par defaut', async () => {
    const { supabase, inserted } = createMock({
      categories: [{ id: 'cat-1', name: 'Plats', display_order: 0 }],
    });

    const result = await bulkImportMenuRows(
      supabase,
      'tenant-1',
      'menu-1',
      group([row({ rowKey: 5, name: 'Poulet DG', price: 6500 })]),
    );

    expect(result).toMatchObject({ itemsCreated: 1, itemsUpdated: 0, itemsSkipped: 0 });
    expect(result.errors).toEqual([]);
    expect(inserted[0]).toEqual({
      tenant_id: 'tenant-1',
      category_id: 'cat-1',
      name: 'Poulet DG',
      name_en: null,
      description: null,
      description_en: null,
      price: 6500,
      is_available: true,
      is_featured: false,
    });
  });

  it('met a jour un plat deja present (meme categorie, meme nom) au lieu de le dupliquer', async () => {
    const { supabase, inserted, updated } = createMock({
      categories: [{ id: 'cat-1', name: 'Plats', display_order: 0 }],
      items: [{ id: 'item-1', category_id: 'cat-1', name: 'Poulet DG' }],
    });

    const result = await bulkImportMenuRows(
      supabase,
      'tenant-1',
      'menu-1',
      group([row({ rowKey: 5, name: '  poulet   dg ', price: 7000, isAvailable: false })]),
    );

    expect(result).toMatchObject({ itemsCreated: 0, itemsUpdated: 1 });
    expect(inserted).toEqual([]);
    expect(updated).toEqual([
      { id: 'item-1', patch: { name: '  poulet   dg ', price: 7000, is_available: false } },
    ]);
  });

  it('ne remplace pas une valeur existante par une case vide', async () => {
    const { supabase, updated } = createMock({
      categories: [{ id: 'cat-1', name: 'Plats', display_order: 0 }],
      items: [{ id: 'item-1', category_id: 'cat-1', name: 'Poulet DG' }],
    });

    await bulkImportMenuRows(
      supabase,
      'tenant-1',
      'menu-1',
      group([row({ rowKey: 5, name: 'Poulet DG', price: 6500, description: null })]),
    );

    expect(updated[0].patch).not.toHaveProperty('description');
    expect(updated[0].patch).not.toHaveProperty('is_available');
    expect(updated[0].patch).not.toHaveProperty('is_featured');
  });

  it('signale un plat en double dans le fichier et garde la premiere ligne', async () => {
    const { supabase, inserted } = createMock({
      categories: [{ id: 'cat-1', name: 'Plats', display_order: 0 }],
    });

    const result = await bulkImportMenuRows(
      supabase,
      'tenant-1',
      'menu-1',
      group([row({ rowKey: 5, name: 'Poulet DG' }), row({ rowKey: 9, name: 'Poulet DG' })]),
    );

    expect(inserted).toHaveLength(1);
    expect(result.errors).toEqual([{ key: 9, message: expect.stringMatching(/deux fois/) }]);
  });

  it('applique la limite du forfait aux seuls nouveaux plats', async () => {
    const { supabase, inserted, updated } = createMock({
      categories: [{ id: 'cat-1', name: 'Plats', display_order: 0 }],
      items: [{ id: 'item-1', category_id: 'cat-1', name: 'Existant' }],
    });

    const result = await bulkImportMenuRows(
      supabase,
      'tenant-1',
      'menu-1',
      group([
        row({ rowKey: 5, name: 'Existant' }),
        row({ rowKey: 6, name: 'Nouveau A' }),
        row({ rowKey: 7, name: 'Nouveau B' }),
      ]),
      { maxNewItems: 1 },
    );

    expect(updated).toHaveLength(1);
    expect(inserted.map((r) => r.name)).toEqual(['Nouveau A']);
    expect(result.errors).toEqual([{ key: 7, message: expect.stringMatching(/forfait/) }]);
  });

  it('cree la categorie manquante puis y range les plats', async () => {
    const { supabase, inserted } = createMock();

    const result = await bulkImportMenuRows(
      supabase,
      'tenant-1',
      'menu-1',
      group([row({ rowKey: 5, name: 'Bissap', category: 'Boissons' })], 'Boissons'),
    );

    expect(result.categoriesCreated).toBe(1);
    expect(inserted[0].category_id).toBe('new-cat-0');
  });
});
