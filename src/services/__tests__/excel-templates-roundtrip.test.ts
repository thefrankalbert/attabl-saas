/**
 * Aller-retour reel des modeles Excel: le fichier que l'on fait telecharger au
 * restaurateur doit etre relu sans erreur par l'import correspondant.
 *
 * Aucun mock de lecture ici: exceljs ecrit puis relit le vrai fichier. C'est le
 * test qui manquait quand la bande de titre ajoutee aux modeles (juillet 2026)
 * a fait refuser chaque modele par son propre import.
 */
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createExcelImportService } from '../excel-import.service';
import { createSupplierImportService } from '../supplier-import.service';
import { createRecipeImportService } from '../recipe-import.service';
import { readFirstSheetRows } from '@/lib/excel-parse';

// Le parsing ne touche pas la base: un client vide suffit.
const noDb = {} as SupabaseClient;

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe('modeles Excel: telecharger puis recharger', () => {
  it('modele de carte: toutes les lignes d exemple sont relues, sans erreur', async () => {
    const svc = createExcelImportService(noDb);
    const { rows, errors } = await svc.parseExcel(toArrayBuffer(await svc.generateTemplate()));

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({
      category: 'Entrées',
      categoryEn: 'Starters',
      name: 'Salade avocat crevettes',
      nameEn: 'Avocado and shrimp salad',
      price: 3500,
      isAvailable: true,
      isFeatured: false,
    });
    // Numero de ligne tel qu'affiche dans Excel (titre, sous-titre, vide, en-tetes).
    expect(rows[0].rowNumber).toBe(5);
  });

  it('modele de carte: le mode d emploi est dans un second onglet', async () => {
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(toArrayBuffer(await createExcelImportService(noDb).generateTemplate()));

    expect(wb.worksheets.map((w) => w.name)).toEqual(['Carte', "Mode d'emploi"]);
    expect(String(wb.worksheets[1].getCell('A1').value)).toMatch(/Mode d'emploi/);
  });

  it('modele de carte: les en-tetes affiches sont en francais', async () => {
    const buf = toArrayBuffer(await createExcelImportService(noDb).generateTemplate());
    const sheet = await readFirstSheetRows(buf);

    expect(sheet[3]).toEqual([
      'Catégorie',
      'Catégorie EN',
      'Nom du plat',
      'Nom du plat EN',
      'Description',
      'Description EN',
      'Prix',
      'Disponible',
      'En vedette',
    ]);
  });

  it('modele fournisseurs: relu sans erreur', async () => {
    const svc = createSupplierImportService(noDb);
    const { rows, errors } = await svc.parseExcel(toArrayBuffer(await svc.generateTemplate()));

    expect(errors).toEqual([]);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('modele fiches techniques: relu sans erreur', async () => {
    const svc = createRecipeImportService(noDb);
    const { rows, errors } = await svc.parseExcel(toArrayBuffer(await svc.generateTemplate()));

    expect(errors).toEqual([]);
    expect(rows.length).toBeGreaterThan(0);
  });
});
