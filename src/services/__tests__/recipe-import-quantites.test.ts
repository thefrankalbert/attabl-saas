import { describe, it, expect, vi } from 'vitest';
import { createRecipeImportService } from '../recipe-import.service';
import { buildXlsx } from './xlsx-fixture';
import type { RecipeImportRpcRow } from '@/types/inventory.types';
import { makeRecipeDb } from './recipe-supabase-mock';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// B83: "0,250" (kg) saisi en cellule TEXTE etait lu 250 kg: la regle des prix
//      (un separateur suivi de 3 chiffres = milliers) etait appliquee aux
//      quantites. Pour une quantite, un separateur unique est decimal.
// B82: la quantite convertie gardait 6 decimales alors que
//      `recipes.quantity_needed` est numeric(10,3) > 0: 0,5 g d'un ingredient
//      suivi en kg devenait 1 g, 0,4 g faisait echouer TOUT l'import.

const RPC_OK = {
  data: { recipes_created: 1, recipes_updated: 0, ingredients_created: 0 },
  error: null,
};

describe('import des fiches techniques: quantites', () => {
  it('B83: une quantite en texte a 3 decimales est decimale, pas des milliers', async () => {
    const { supabase } = makeRecipeDb();
    const { rows, errors } = await createRecipeImportService(supabase).parseExcel(
      await buildXlsx([
        ['Plat', 'Ingredient', 'Unite', 'Quantite'],
        ['Poulet DG', 'Poulet', 'kg', '0,250'],
        ['Poulet DG', 'Huile', 'L', '0.250'],
        ['Poulet DG', 'Sel', 'g', '1 000,5'],
        ['Poulet DG', 'Oignon', 'kg', '1,5'],
        ['Poulet DG', 'Ail', 'g', '1.25'],
        ['Poulet DG', 'Eau', 'cl', '1500'],
      ]),
    );
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.quantityNeeded)).toEqual([0.25, 0.25, 1000.5, 1.5, 1.25, 1500]);
  });

  // Decision apres le contre-audit 1: une ecriture ambigue est refusee.
  it('B83: "1,500", "1.500", "12,500" (1500 ou 1,5 ?) sont refusees avec un message', async () => {
    const { supabase } = makeRecipeDb();
    const { rows, errors } = await createRecipeImportService(supabase).parseExcel(
      await buildXlsx([
        ['Plat', 'Ingredient', 'Unite', 'Quantite'],
        ['Poulet DG', 'Poulet', 'g', '1,500'],
        ['Poulet DG', 'Huile', 'cl', '1.500'],
        ['Poulet DG', 'Sel', 'g', '12,500'],
        ['Poulet DG', 'Riz', 'kg', '0,250'],
      ]),
    );
    expect(rows.map((r) => r.ingredientName)).toEqual(['Riz']);
    expect(errors.map((e) => e.row)).toEqual([2, 3, 4]);
    expect(errors[0].message).toContain('ambigue');
    expect(errors[0].message).toContain('1500');
  });

  // Contre-audit 2: lues fausses en silence avant ("1/2" = 12, "2 x 0,5" = 20,5,
  // "1e3" = 13).
  it('B83: fraction, calcul ou notation scientifique refuses avec un message', async () => {
    const { supabase } = makeRecipeDb();
    const { rows, errors } = await createRecipeImportService(supabase).parseExcel(
      await buildXlsx([
        ['Plat', 'Ingredient', 'Unite', 'Quantite'],
        ['Poulet DG', 'Poulet', 'kg', '1/2'],
        ['Poulet DG', 'Huile', 'L', '2 x 0,5'],
        ['Poulet DG', 'Sel', 'g', '1e3'],
        ['Poulet DG', 'Riz', 'kg', '0,5 kg'],
        ['Poulet DG', 'Eau', 'cl', '25 cl'],
      ]),
    );
    expect(rows.map((r) => [r.ingredientName, r.quantityNeeded])).toEqual([
      ['Riz', 0.5],
      ['Eau', 25],
    ]);
    expect(errors.map((e) => e.row)).toEqual([2, 3, 4]);
    expect(errors[0].message).toContain('Quantite illisible');
    expect(errors[0].message).toContain('0,5 kg');
  });

  // Contre-audit 3 (defaut 2): "0,5kg." etait lu 5, "1 2" lu 12, "2 5 kg" lu 25.
  it('B83: point final apres l unite et groupes d espaces mal formes', async () => {
    const { supabase } = makeRecipeDb();
    const { rows, errors } = await createRecipeImportService(supabase).parseExcel(
      await buildXlsx([
        ['Plat', 'Ingredient', 'Unite', 'Quantite'],
        ['Poulet DG', 'Riz', 'kg', '0,5kg.'],
        ['Poulet DG', 'Sel', 'g', '1 2'],
        ['Poulet DG', 'Huile', 'kg', '2 5 kg'],
        ['Poulet DG', 'Eau', 'g', '1 500 g'],
        ['Poulet DG', 'Lait', 'cl', '1500\t2500'],
      ]),
    );
    expect(rows.map((r) => [r.ingredientName, r.quantityNeeded])).toEqual([
      ['Riz', 0.5],
      ['Eau', 1500],
    ]);
    expect(errors.map((e) => e.row)).toEqual([3, 4, 6]);
    expect(errors.every((e) => e.message.includes('Quantite illisible'))).toBe(true);
  });

  // Contre-audit 4: "0 500" et deux valeurs sur deux lignes sont refuses.
  it('B83: "0 500" et "1\\n500" refuses ; "0,5" et "0.25" lus', async () => {
    const { supabase } = makeRecipeDb();
    const { rows, errors } = await createRecipeImportService(supabase).parseExcel(
      await buildXlsx([
        ['Plat', 'Ingredient', 'Unite', 'Quantite'],
        ['Poulet DG', 'Riz', 'kg', '0 500'],
        ['Poulet DG', 'Sel', 'g', '1\n500'],
        ['Poulet DG', 'Huile', 'L', '0,5'],
        ['Poulet DG', 'Eau', 'L', '0.25'],
      ]),
    );
    expect(rows.map((r) => [r.ingredientName, r.quantityNeeded])).toEqual([
      ['Huile', 0.5],
      ['Eau', 0.25],
    ]);
    expect(errors.map((e) => e.row)).toEqual([2, 3]);
  });

  it('B83 temoin: une cellule numerique est lue telle quelle', async () => {
    const { supabase } = makeRecipeDb();
    const { rows } = await createRecipeImportService(supabase).parseExcel(
      await buildXlsx([
        ['Plat', 'Ingredient', 'Unite', 'Quantite'],
        ['Poulet DG', 'Poulet', 'kg', 0.25],
      ]),
    );
    expect(rows[0].quantityNeeded).toBe(0.25);
  });

  it('B82: quantite trop fine apres conversion -> erreur de ligne, le reste est importe', async () => {
    const { supabase, rpcCalls } = makeRecipeDb({
      menu_items: [{ id: 'm1', name: 'Poulet DG' }],
      ingredients: [
        { id: 'i1', name: 'Sel', unit: 'kg' },
        { id: 'i2', name: 'Poivre', unit: 'kg' },
        { id: 'i3', name: 'Poulet', unit: 'kg' },
      ],
      rpcResult: RPC_OK,
    });
    const result = await createRecipeImportService(supabase).importFromExcel(
      'tenant-1',
      await buildXlsx([
        ['Plat', 'Ingredient', 'Unite', 'Quantite'],
        ['Poulet DG', 'Sel', 'g', 0.4], // 0,0004 kg: refusee par la base (> 0 apres arrondi a 3)
        ['Poulet DG', 'Poivre', 'g', 0.5], // 0,0005 kg: arrondie en silence a 1 g
        ['Poulet DG', 'Poulet', 'g', 500], // 0,5 kg: temoin
      ]),
    );
    const payload = rpcCalls[0].args.p_rows as RecipeImportRpcRow[];
    expect(payload.map((r) => r.ingredient_name)).toEqual(['Poulet']);
    expect(payload[0].quantity_needed).toBe(0.5);
    expect(result.errors.map((e) => e.row)).toEqual([2, 3]);
    expect(result.errors[0].message).toContain('3 decimales');
  });

  it('B82: quantite au-dela de la colonne (10^7) -> erreur de ligne', async () => {
    const { supabase, rpcCalls } = makeRecipeDb({
      menu_items: [{ id: 'm1', name: 'Poulet DG' }],
      ingredients: [{ id: 'i1', name: 'Eau', unit: 'L' }],
      rpcResult: RPC_OK,
    });
    const result = await createRecipeImportService(supabase).importFromExcel(
      'tenant-1',
      await buildXlsx([
        ['Plat', 'Ingredient', 'Unite', 'Quantite'],
        ['Poulet DG', 'Eau', 'L', 10_000_000],
      ]),
    );
    expect(rpcCalls).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });
});
