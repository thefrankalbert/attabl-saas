import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// B71 et B72 (revue ligne par ligne, lot B2b-2). Doublures du lecteur PDF et
// du modele: aucun appel reel.
//   B71: reponse du modele coupee a 4096 jetons (stop_reason = max_tokens):
//        JSON tronque, message trompeur "pas du JSON valide". Texte du PDF coupe
//        a 15 000 caracteres sans le dire.
//   B72: prix en texte avec separateur de milliers ("1.500", "12.500 FCFA")
//        lu 1,5 ou 12,5.

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const state = vi.hoisted(() => ({
  pdfText: 'Carte du restaurant\nPoulet DG 4500',
  reply: { content: [{ type: 'text', text: '[]' }], stop_reason: 'end_turn' } as {
    content: Array<{ type: string; text: string }>;
    stop_reason: string;
  },
}));

vi.mock('pdf-parse', () => ({
  PDFParse: class {
    async getText() {
      return { text: state.pdfText, pages: [{}] };
    }
    async destroy() {}
  },
}));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: async () => state.reply };
  },
}));

import { createPdfImportService } from '../pdf-import.service';

const service = () => createPdfImportService({} as SupabaseClient);

function replyWith(items: unknown[], stop_reason = 'end_turn') {
  state.reply = { content: [{ type: 'text', text: JSON.stringify(items) }], stop_reason };
}

describe('extractFromPdf', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test';
    state.pdfText = 'Carte du restaurant\nPoulet DG 4500';
  });

  it('B71: reponse coupee par la limite de jetons -> message clair (carte trop longue)', async () => {
    state.reply = {
      content: [{ type: 'text', text: '[{"category":"Plats","name":"Poulet' }],
      stop_reason: 'max_tokens',
    };
    await expect(service().extractFromPdf(Buffer.from('x'), 'XAF')).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expect.stringContaining('trop longue'),
    });
  });

  it('B71: texte du PDF au-dela de la limite -> truncated = true', async () => {
    state.pdfText = 'A'.repeat(15_001);
    replyWith([{ category: 'Plats', name: 'Riz', description: null, price: 1000 }]);
    const res = await service().extractFromPdf(Buffer.from('x'), 'XAF');
    expect(res.truncated).toBe(true);
  });

  it('B71 temoin: texte court -> truncated = false', async () => {
    replyWith([{ category: 'Plats', name: 'Riz', description: null, price: 1000 }]);
    const res = await service().extractFromPdf(Buffer.from('x'), 'XAF');
    expect(res.truncated).toBe(false);
  });

  it('B72: devise sans decimales (FCFA): seuls les chiffres comptent', async () => {
    replyWith([
      { category: 'Plats', name: 'Poulet DG', description: null, price: '1.500' },
      { category: 'Plats', name: 'Ndole', description: null, price: '12.500 FCFA' },
      { category: 'Plats', name: 'Braise', description: null, price: '3 000' },
    ]);
    const res = await service().extractFromPdf(Buffer.from('x'), 'XAF');
    expect(res.items.map((i) => i.price)).toEqual([1500, 12500, 3000]);
  });

  it('B72: devise a decimales (EUR): milliers et decimales distingues', async () => {
    replyWith([
      { category: 'Plats', name: 'Menu', description: null, price: '1.500' },
      { category: 'Plats', name: 'Salade', description: null, price: '12,50' },
      { category: 'Plats', name: 'Banquet', description: null, price: '1.234,56' },
    ]);
    const res = await service().extractFromPdf(Buffer.from('x'), 'EUR');
    expect(res.items.map((i) => i.price)).toEqual([1500, 12.5, 1234.56]);
  });

  // Contre-audit 1, defaut 1: "2 500,00 FCFA" et "2500.00" etaient lus 250000.
  it('B72: FCFA avec decimale nulle = prix entier ; vraie decimale = refusee et signalee', async () => {
    replyWith([
      { category: 'Plats', name: 'Poulet DG', description: null, price: '2 500,00 FCFA' },
      { category: 'Plats', name: 'Ndole', description: null, price: '2500.00' },
      { category: 'Plats', name: 'Braise', description: null, price: '1,500.50' },
      { category: 'Plats', name: 'Duo', description: null, price: '1500 / 2500' },
      { category: 'Plats', name: 'Soupe', description: null, price: 1.5 },
    ]);
    const res = await service().extractFromPdf(Buffer.from('x'), 'XOF');
    // Contre-audit 2: un plat au prix refuse n'est PAS dans la liste a importer.
    expect(res.items.map((i) => [i.name, i.price])).toEqual([
      ['Poulet DG', 2500],
      ['Ndole', 2500],
    ]);
    expect(res.notImported).toEqual([
      { name: 'Braise', price: '1,500.50', reason: 'decimale' },
      { name: 'Duo', price: '1500 / 2500', reason: 'illisible' },
      { name: 'Soupe', price: '1.5', reason: 'decimale' },
    ]);
  });

  it('B72 temoin: en EUR, "1,500.50" reste 1500,5 et rien n est refuse', async () => {
    replyWith([{ category: 'Plats', name: 'Menu', description: null, price: '1,500.50' }]);
    const res = await service().extractFromPdf(Buffer.from('x'), 'EUR');
    expect(res.items[0].price).toBe(1500.5);
    expect(res.notImported).toEqual([]);
  });

  it('temoin: un prix deja numerique est garde', async () => {
    replyWith([{ category: 'Plats', name: 'Riz', description: null, price: 2500 }]);
    const res = await service().extractFromPdf(Buffer.from('x'), 'XAF');
    expect(res.items[0].price).toBe(2500);
  });

  // Contre-audit 2 (defaut 1): chaque cas, en XOF, XAF et EUR. Aucun plat a 0
  // dans `items`; nuls, negatifs, trop eleves et illisibles sont SIGNALES.
  const PRIX: Array<
    [string | number, { XOF: number | string; XAF: number | string; EUR: number | string }]
  > = [
    ['1.500', { XOF: 1500, XAF: 1500, EUR: 1500 }],
    ['12.500 FCFA', { XOF: 12500, XAF: 12500, EUR: 12500 }],
    ['1 500', { XOF: 1500, XAF: 1500, EUR: 1500 }],
    ['1\u00a0500', { XOF: 1500, XAF: 1500, EUR: 1500 }],
    ['1\u202f500 F', { XOF: 1500, XAF: 1500, EUR: 1500 }],
    ['2500.00', { XOF: 2500, XAF: 2500, EUR: 2500 }],
    ['2 500,00 FCFA', { XOF: 2500, XAF: 2500, EUR: 2500 }],
    ['1,500,000', { XOF: 1500000, XAF: 1500000, EUR: 1500000 }],
    ['1,500.00', { XOF: 1500, XAF: 1500, EUR: 1500 }],
    ['1,500.50', { XOF: 'decimale', XAF: 'decimale', EUR: 1500.5 }],
    ['1.500,50', { XOF: 'decimale', XAF: 'decimale', EUR: 1500.5 }],
    ['12,5', { XOF: 'decimale', XAF: 'decimale', EUR: 12.5 }],
    ['1.50', { XOF: 'decimale', XAF: 'decimale', EUR: 1.5 }],
    ['-500', { XOF: 'negatif_ou_nul', XAF: 'negatif_ou_nul', EUR: 'negatif_ou_nul' }],
    ['0', { XOF: 'negatif_ou_nul', XAF: 'negatif_ou_nul', EUR: 'negatif_ou_nul' }],
    ['1500 / 2500', { XOF: 'illisible', XAF: 'illisible', EUR: 'illisible' }],
    ['99999999999', { XOF: 'trop_eleve', XAF: 'trop_eleve', EUR: 'trop_eleve' }],
    ['1e12', { XOF: 'illisible', XAF: 'illisible', EUR: 'illisible' }],
    ['', { XOF: 'illisible', XAF: 'illisible', EUR: 'illisible' }],
    [-500, { XOF: 'negatif_ou_nul', XAF: 'negatif_ou_nul', EUR: 'negatif_ou_nul' }],
    [0, { XOF: 'negatif_ou_nul', XAF: 'negatif_ou_nul', EUR: 'negatif_ou_nul' }],
    [1e12, { XOF: 'trop_eleve', XAF: 'trop_eleve', EUR: 'trop_eleve' }],
    [2500, { XOF: 2500, XAF: 2500, EUR: 2500 }],
    [12.5, { XOF: 'decimale', XAF: 'decimale', EUR: 12.5 }],
  ];
  for (const currency of ['XOF', 'XAF', 'EUR'] as const) {
    it.each(PRIX)(`${currency}: prix %j`, async (raw, attendu) => {
      replyWith([{ category: 'Plats', name: 'Plat', description: null, price: raw }]);
      const res = await service().extractFromPdf(Buffer.from('x'), currency);
      const expected = attendu[currency];
      if (typeof expected === 'number') {
        expect(res.items.map((i) => i.price)).toEqual([expected]);
        expect(res.notImported).toEqual([]);
      } else {
        expect(res.items).toEqual([]);
        expect(res.notImported.map((n) => n.reason)).toEqual([expected]);
      }
    });
  }
});
