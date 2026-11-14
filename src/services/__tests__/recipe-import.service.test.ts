import { describe, it, expect, vi } from 'vitest';
import { createRecipeImportService } from '../recipe-import.service';
import { ServiceError } from '../errors';
import { buildXlsx } from './xlsx-fixture';
import { readFirstSheetRows } from '@/lib/excel-parse';
import type { RecipeImportRpcRow } from '@/types/inventory.types';
import { makeRecipeDb, toArrayBuffer } from './recipe-supabase-mock';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// Former single-query mock, kept as a thin adapter over the table-aware double.
function makeSupabase(
  opts: {
    menuItems?: Array<{ id: string; name: string }>;
    rpcResult?: { data: unknown; error: unknown };
  } = {},
) {
  return makeRecipeDb({ menu_items: opts.menuItems, rpcResult: opts.rpcResult });
}

describe('recipe-import.service parseExcel', () => {
  it('maps unit aliases (pcs -> piece, litre -> L) and groups rows per dish', async () => {
    const { supabase } = makeSupabase();
    const svc = createRecipeImportService(supabase);
    const buffer = await buildXlsx([
      ['Plat', 'Ingrédient', 'Unité', 'Quantité', 'Notes'],
      ['Poulet DG', 'Poulet', 'kg', '0,3', ''],
      ['Poulet DG', 'Oeuf', 'pcs', 2, 'frais'],
      ['Jus', 'Eau', 'litre', 1, ''],
    ]);
    const { rows, errors } = await svc.parseExcel(buffer);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ dishName: 'Poulet DG', unit: 'kg', quantityNeeded: 0.3 });
    expect(rows[1].unit).toBe('pièce');
    expect(rows[2].unit).toBe('L');
  });

  it('collects row errors for unknown unit, non-positive qty and missing ingredient', async () => {
    const { supabase } = makeSupabase();
    const svc = createRecipeImportService(supabase);
    const buffer = await buildXlsx([
      ['Dish', 'Ingredient', 'Unit', 'Quantity'],
      ['A', 'X', 'gallons', 1], // unknown unit
      ['A', 'Y', 'kg', -1], // negative qty
      ['A', '', 'kg', 1], // missing ingredient
    ]);
    const { rows, errors } = await svc.parseExcel(buffer);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(3);
  });

  it('throws VALIDATION when required columns are missing', async () => {
    const { supabase } = makeSupabase();
    const svc = createRecipeImportService(supabase);
    const buffer = await buildXlsx([
      ['Dish', 'Ingredient'],
      ['A', 'X'],
    ]);
    await expect(svc.parseExcel(buffer)).rejects.toBeInstanceOf(ServiceError);
  });
});

describe('recipe-import.service importFromExcel', () => {
  it('pre-filters unknown + ambiguous dishes; sends only clean rows to the RPC', async () => {
    const { supabase, rpcCalls } = makeSupabase({
      menuItems: [
        { id: 'm1', name: 'Poulet DG' },
        { id: 'dup', name: 'Salade' },
        { id: 'dup2', name: 'Salade' }, // ambiguous
      ],
      rpcResult: {
        data: { recipes_created: 1, recipes_updated: 0, ingredients_created: 1 },
        error: null,
      },
    });
    const svc = createRecipeImportService(supabase);
    const buffer = await buildXlsx([
      ['Dish', 'Ingredient', 'Unit', 'Quantity'],
      ['Poulet DG', 'Poulet', 'kg', 0.3], // clean
      ['Inconnu', 'Riz', 'kg', 0.2], // unknown dish -> error
      ['Salade', 'Laitue', 'g', 100], // ambiguous -> error
    ]);

    const result = await svc.importFromExcel('tenant-1', buffer);

    expect(rpcCalls).toHaveLength(1);
    const payload = rpcCalls[0].args.p_rows as RecipeImportRpcRow[];
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({ menu_item_id: 'm1', ingredient_name: 'Poulet', unit: 'kg' });

    expect(result.recipesCreated).toBe(1);
    expect(result.ingredientsCreated).toBe(1);
    expect(result.errors).toHaveLength(2); // unknown + ambiguous
    expect(result.itemsSkipped).toBe(2);
  });

  it('does not call the RPC when every row is invalid', async () => {
    const { supabase, rpcCalls } = makeSupabase({ menuItems: [] });
    const svc = createRecipeImportService(supabase);
    const buffer = await buildXlsx([
      ['Dish', 'Ingredient', 'Unit', 'Quantity'],
      ['Ghost', 'Riz', 'kg', 1],
    ]);
    const result = await svc.importFromExcel('tenant-1', buffer);
    expect(rpcCalls).toHaveLength(0);
    expect(result.recipesCreated).toBe(0);
    expect(result.errors).toHaveLength(1);
  });

  it('maps an RPC MENU_ITEM_NOT_FOUND error to a NOT_FOUND ServiceError', async () => {
    const { supabase } = makeSupabase({
      menuItems: [{ id: 'm1', name: 'Poulet DG' }],
      rpcResult: { data: null, error: { message: 'MENU_ITEM_NOT_FOUND' } },
    });
    const svc = createRecipeImportService(supabase);
    const buffer = await buildXlsx([
      ['Dish', 'Ingredient', 'Unit', 'Quantity'],
      ['Poulet DG', 'Poulet', 'kg', 0.3],
    ]);
    await expect(svc.importFromExcel('tenant-1', buffer)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('maps an RPC INVALID_UNIT error to a VALIDATION ServiceError', async () => {
    const { supabase } = makeSupabase({
      menuItems: [{ id: 'm1', name: 'Poulet DG' }],
      rpcResult: { data: null, error: { message: 'INVALID_UNIT: gallons' } },
    });
    const svc = createRecipeImportService(supabase);
    const buffer = await buildXlsx([
      ['Dish', 'Ingredient', 'Unit', 'Quantity'],
      ['Poulet DG', 'Poulet', 'kg', 0.3],
    ]);
    await expect(svc.importFromExcel('tenant-1', buffer)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('generateTemplate returns the tenant workbook with French headers', async () => {
    const { supabase } = makeSupabase();
    const svc = createRecipeImportService(supabase);
    const buf = await svc.generateTemplate('tenant-1');
    expect(Buffer.isBuffer(buf)).toBe(true);
    const aoa = await readFirstSheetRows(toArrayBuffer(buf));
    // Styled workbook adds a branded title band + subtitle before the header row.
    const headerRow = aoa.find((r) => (r as string[])?.includes('Plat')) as string[] | undefined;
    expect(headerRow).toEqual(['Catégorie', 'Plat', 'Ingrédient', 'Unité', 'Quantité', 'Notes']);
  });
});
