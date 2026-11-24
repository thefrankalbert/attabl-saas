import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createExcelImportService } from '../excel-import.service';
import { buildXlsx } from './xlsx-fixture';
import { readFirstSheetRows } from '@/lib/excel-parse';

// B72 / contre-audit 2 (defaut 6, traite dans le lot): l'import Excel de la
// carte lisait les prix sans regle par devise ("1.50" = 1,5 F, "1500 / 2500" =
// 15002500). Il utilise maintenant la MEME lecture que l'import PDF
// (`readMenuPrice`). Une cellule NUMERIQUE reste un nombre; seule une cellule
// texte passe par la regle.

const noDb = {} as SupabaseClient;
const svc = () => createExcelImportService(noDb);

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

async function prix(cell: unknown, currency: string) {
  const { rows, errors } = await svc().parseExcel(
    await buildXlsx([
      ['Categorie', 'Nom du plat', 'Prix'],
      ['Plats', 'Poulet DG', cell],
    ]),
    currency,
  );
  return { prices: rows.map((r) => r.price), errors };
}

describe('import Excel de la carte: lecture des prix par devise', () => {
  it.each(['XOF', 'XAF', 'EUR'])(
    'fichier exporte par l application puis reimporte sans modification (%s): memes prix',
    async (currency) => {
      const buffer = toArrayBuffer(await svc().generateTemplate());
      const sheet = await readFirstSheetRows(buffer);
      const header = sheet.findIndex((r) => (r as unknown[]).includes('Prix'));
      const priceCol = (sheet[header] as unknown[]).indexOf('Prix');
      const exportes = sheet
        .slice(header + 1)
        .filter((r) => (r as unknown[]).some((c) => c !== null && c !== ''))
        .map((r) => (r as unknown[])[priceCol]);

      const { rows, errors } = await svc().parseExcel(buffer, currency);

      expect(errors).toEqual([]);
      expect(exportes.every((p) => typeof p === 'number')).toBe(true);
      expect(rows.map((r) => r.price)).toEqual(exportes);
    },
  );

  it.each([
    ['XOF', '1.500', 1500],
    ['XAF', '2 500,00 FCFA', 2500],
    ['XOF', 1500, 1500],
    ['EUR', '12,50', 12.5],
    ['EUR', 12.5, 12.5],
  ])('%s: cellule %j lue %d', async (currency, cell, attendu) => {
    const { prices, errors } = await prix(cell, currency);
    expect(errors).toEqual([]);
    expect(prices).toEqual([attendu]);
  });

  it.each([
    ['XOF', '1.50', 'centimes'],
    ['XAF', '1500 / 2500', 'illisible'],
    ['XOF', 1.5, 'centimes'],
    ['XOF', '0', 'nul ou negatif'],
    ['EUR', 0, 'nul ou negatif'],
    ['EUR', '-12', 'nul ou negatif'],
    ['EUR', '1500 / 2500', 'illisible'],
    ['XOF', 999999999999, 'trop eleve'],
  ])('%s: cellule %j refusee, plat non importe', async (currency, cell, raison) => {
    const { prices, errors } = await prix(cell, currency);
    expect(prices).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Plat non importe');
    expect(errors[0].message).toContain(raison);
  });
});
