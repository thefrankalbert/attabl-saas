/**
 * Fiches techniques: telecharger le fichier rempli, le modifier, le recharger.
 * exceljs ecrit puis relit le vrai fichier (aucun mock de lecture).
 */
import { describe, it, expect, vi } from 'vitest';
import { createRecipeImportService } from '../recipe-import.service';
import { readFirstSheetRows } from '@/lib/excel-parse';
import type { RecipeImportRpcRow } from '@/types/inventory.types';
import { buildXlsx } from './xlsx-fixture';
import { makeRecipeDb, toArrayBuffer, type RecipeDbFixture } from './recipe-supabase-mock';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const RESTO: RecipeDbFixture = {
  categories: [
    { id: 'c-plats', name: 'Plats', display_order: 2 },
    { id: 'c-entrees', name: 'Entrées', display_order: 1 },
  ],
  menu_items: [
    { id: 'm-poulet', name: 'Poulet DG', category_id: 'c-plats' },
    { id: 'm-alloco', name: 'Alloco', category_id: 'c-entrees' },
    { id: 'm-salade', name: 'Salade', category_id: 'c-entrees' },
  ],
  ingredients: [
    { id: 'i-poulet', name: 'Poulet', unit: 'kg' },
    { id: 'i-plantain', name: 'Plantain', unit: 'kg' },
    { id: 'i-huile', name: 'Huile', unit: 'L' },
    { id: 'i-oeuf', name: 'Oeuf', unit: 'pièce' },
  ],
  recipes: [
    { menu_item_id: 'm-poulet', ingredient_id: 'i-poulet', quantity_needed: 0.3, notes: null },
    {
      menu_item_id: 'm-poulet',
      ingredient_id: 'i-plantain',
      quantity_needed: 0.2,
      notes: 'Bien mur',
    },
    { menu_item_id: 'm-alloco', ingredient_id: 'i-plantain', quantity_needed: 0.25, notes: null },
    { menu_item_id: 'm-alloco', ingredient_id: 'i-huile', quantity_needed: 0.05, notes: null },
  ],
};

const HEADERS = ['Catégorie', 'Plat', 'Ingrédient', 'Unité', 'Quantité', 'Notes'];

async function exportFile(fx: RecipeDbFixture = RESTO): Promise<ArrayBuffer> {
  const { supabase } = makeRecipeDb(fx);
  return toArrayBuffer(await createRecipeImportService(supabase).generateTemplate('t1'));
}

describe('fiches techniques: le fichier telecharge est rempli', () => {
  it('suit la carte: categorie, plat, ingredients; un plat sans fiche a une ligne vide', async () => {
    const sheet = await readFirstSheetRows(await exportFile());
    const header = sheet.findIndex((r) => (r as unknown[])[0] === 'Catégorie');
    expect(sheet[header]).toEqual(HEADERS);
    // 200 empty rows follow, carrying the dropdowns for additions: skip them.
    const data = sheet
      .slice(header + 1)
      .map((r) => (r as unknown[]).slice(0, 5))
      .filter((r) => r.some((c) => c !== '' && c != null));
    expect(data).toEqual([
      ['Entrées', 'Alloco', 'Huile', 'L', 0.05],
      ['Entrées', 'Alloco', 'Plantain', 'kg', 0.25],
      ['Entrées', 'Salade', '', '', ''],
      ['Plats', 'Poulet DG', 'Plantain', 'kg', 0.2],
      ['Plats', 'Poulet DG', 'Poulet', 'kg', 0.3],
    ]);
  });

  it('a un mode d emploi et des listes deroulantes (ingredients libres, unites strictes)', async () => {
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await exportFile());
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Fiches techniques',
      'Listes',
      "Mode d'emploi",
    ]);
    expect(wb.worksheets[1].state).toBe('hidden');
    const data = wb.worksheets[0];
    const ingredientRule = data.getCell('C5').dataValidation;
    const unitRule = data.getCell('D5').dataValidation;
    // exceljs omits a false flag; absent = Excel accepts a value outside the list.
    expect(ingredientRule?.type).toBe('list');
    expect(Boolean(ingredientRule?.showErrorMessage)).toBe(false);
    expect(unitRule).toMatchObject({ type: 'list', showErrorMessage: true });
    expect(wb.worksheets[1].getColumn(2).values).toContain('pièce');
  });
});

describe('fiches techniques: recharger', () => {
  it('le fichier telecharge, recharge tel quel, ne change rien', async () => {
    const file = await exportFile();
    const { supabase, rpcCalls, deletes } = makeRecipeDb(RESTO);
    const result = await createRecipeImportService(supabase).importFromExcel('t1', file);

    expect(result.errors).toEqual([]);
    expect(result.recipesUnchanged).toBe(4);
    expect(result.recipesCreated + result.recipesUpdated + result.recipesRemoved).toBe(0);
    expect(rpcCalls).toHaveLength(0);
    expect(deletes).toHaveLength(0);
  });

  it('convertit les grammes vers l unite de l ingredient (350 g -> 0,35 kg)', async () => {
    const { supabase, rpcCalls } = makeRecipeDb(RESTO);
    const file = await buildXlsx([HEADERS, ['Plats', 'Poulet DG', 'Poulet', 'g', 350, '']]);
    const result = await createRecipeImportService(supabase).importFromExcel('t1', file);

    expect(result.errors).toEqual([]);
    const sent = rpcCalls[0].args.p_rows as RecipeImportRpcRow[];
    expect(sent).toEqual([
      {
        menu_item_id: 'm-poulet',
        ingredient_name: 'Poulet',
        unit: 'kg',
        quantity_needed: 0.35,
        notes: null,
      },
    ]);
  });

  it('refuse une unite d une autre nature au lieu de fausser le stock', async () => {
    const { supabase, rpcCalls } = makeRecipeDb(RESTO);
    const file = await buildXlsx([HEADERS, ['Plats', 'Poulet DG', 'Poulet', 'pièce', 2, '']]);
    const result = await createRecipeImportService(supabase).importFromExcel('t1', file);

    expect(rpcCalls).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/Unité incompatible pour "Poulet".*kg.*pièce/);
  });

  it('quantite 0 retire l ingredient du plat', async () => {
    const { supabase, rpcCalls, deletes } = makeRecipeDb(RESTO);
    const file = await buildXlsx([HEADERS, ['Plats', 'Poulet DG', 'Plantain', '', 0, '']]);
    const result = await createRecipeImportService(supabase).importFromExcel('t1', file);

    expect(result.errors).toEqual([]);
    expect(rpcCalls).toHaveLength(0);
    expect(deletes).toEqual([
      { table: 'recipes', tenant_id: 't1', menu_item_id: 'm-poulet', ingredient_id: 'i-plantain' },
    ]);
    expect(result.recipesRemoved).toBe(1);
  });

  it('quantite 0 sur un ingredient absent du plat ne supprime rien', async () => {
    const { supabase, deletes } = makeRecipeDb(RESTO);
    const file = await buildXlsx([HEADERS, ['Entrées', 'Salade', 'Poulet', 'kg', 0, '']]);
    const result = await createRecipeImportService(supabase).importFromExcel('t1', file);

    expect(result.errors).toEqual([]);
    expect(deletes).toHaveLength(0);
  });

  it('un nouvel ingredient garde l unite de sa premiere ligne, les suivantes sont converties', async () => {
    const { supabase, rpcCalls } = makeRecipeDb(RESTO);
    const file = await buildXlsx([
      HEADERS,
      ['Entrées', 'Salade', 'Tomate', 'kg', 0.1, ''],
      ['Plats', 'Poulet DG', 'Tomate', 'g', 50, ''],
    ]);
    await createRecipeImportService(supabase).importFromExcel('t1', file);

    const sent = rpcCalls[0].args.p_rows as RecipeImportRpcRow[];
    expect(sent.map((r) => [r.unit, r.quantity_needed])).toEqual([
      ['kg', 0.1],
      ['kg', 0.05],
    ]);
  });

  it('une modification de quantite ou de note est envoyee, le reste non', async () => {
    const { supabase, rpcCalls } = makeRecipeDb(RESTO);
    const file = await buildXlsx([
      HEADERS,
      ['Plats', 'Poulet DG', 'Poulet', 'kg', 0.3, ''], // inchangee
      ['Plats', 'Poulet DG', 'Plantain', 'kg', 0.2, 'Tres mur'], // note changee
    ]);
    const result = await createRecipeImportService(supabase).importFromExcel('t1', file);

    const sent = rpcCalls[0].args.p_rows as RecipeImportRpcRow[];
    expect(sent.map((r) => r.ingredient_name)).toEqual(['Plantain']);
    expect(result.recipesUnchanged).toBe(1);
  });
});
