import { describe, it, expect } from 'vitest';
import { parseZeroDecimalPrice, readMenuPrice } from '../parse-price-text';

// B72 et contre-audit 1 (defaut 1): prix en texte pour une devise sans
// decimales (XOF, XAF). Une partie decimale nulle est retiree, les milliers
// sont lus, une vraie decimale est REFUSEE (null), jamais devinee.

describe('parseZeroDecimalPrice', () => {
  it.each([
    ['1.500', 1500],
    ['12.500 FCFA', 12500],
    ['1 500', 1500],
    ['1\u00a0500', 1500], // espace insecable
    ['1\u202f500 F', 1500], // espace fine insecable
    ['2 500,00 FCFA', 2500],
    ['2500.00', 2500],
    ['2\u00a0500,00', 2500],
    ['1,500.00', 1500],
    ['1.500.000', 1500000],
    ['2500', 2500],
    ['0', 0],
    ['10.0', 10],
  ])('lit %j = %d', (text, expected) => {
    expect(parseZeroDecimalPrice(text)).toBe(expected);
  });

  it.each([
    ['1,500.50'], // vraie decimale (avant: 150050)
    ['2500,75'],
    ['12,5'],
    ['1500 / 2500'], // deux prix (avant: 15002500)
    ['-500'],
    ['1.50.000'], // groupe de 2 chiffres apres le premier
    ['gratuit'],
    [''],
  ])('refuse %j', (text) => {
    expect(parseZeroDecimalPrice(text)).toBeNull();
  });
});

// Contre-audit 3 (defaut 1): deux prix separes par un espace, une tabulation ou
// un retour a la ligne etaient COLLES ("1500 2500" = 15002500).
describe('readMenuPrice: un seul nombre, espaces de milliers par groupes de 3', () => {
  it.each(['XOF', 'XAF', 'EUR'])(
    '%s: deux valeurs ou des groupes mal formes sont refuses',
    (currency) => {
      for (const texte of [
        '1500 2500',
        '1500  2500',
        '1 2500',
        '1500\t2500',
        '2500\r\n3500',
        '1500\n2500',
        '15 000 25 000',
        '12,50 15,00',
        'Petit 1500\nGrand 2500',
      ]) {
        expect(readMenuPrice(texte, currency)).toEqual({ ok: false, reason: 'illisible' });
      }
    },
  );

  it.each(['XOF', 'XAF'])('%s: ce qui etait lu juste le reste', (currency) => {
    const cas: Array<[string, number]> = [
      ['1 500', 1500],
      ['1\u00a0500', 1500],
      ['1\u202f500', 1500],
      ['12 500', 12500],
      ['1 250 000', 1250000],
      ['1.500', 1500],
      ['12.500 FCFA', 12500],
      ['2500.00', 2500],
      ['2 500,00', 2500],
      ['1500F', 1500],
      ['1500 F CFA', 1500],
      ['CFA 1500', 1500],
      ['1500.-', 1500],
      ['1 500,-', 1500],
      ['2 500\nFCFA', 2500],
      ['Prix: 2.500F', 2500],
    ];
    for (const [texte, attendu] of cas) {
      expect(readMenuPrice(texte, currency)).toEqual({ ok: true, price: attendu });
    }
  });

  // Regression EUR nulle sur les 21 valeurs du contre-audit 3 (lecture d'avant:
  // `parseNumericCell` puis prix positif borne).
  it('EUR: memes lectures qu avant sur les 21 valeurs du contre-audit', () => {
    const cas: Array<[string, number | null]> = [
      ['12,50', 12.5],
      ['12.50', 12.5],
      ['1.500,75', 1500.75],
      ['1,500.75', 1500.75],
      ['1.500', 1500],
      ['1,500', 1500],
      ['0,99', 0.99],
      ['\u20ac 1 234,56', 1234.56],
      ['1 234,56 \u20ac', 1234.56],
      ['12,5', 12.5],
      ['12,505', 12505],
      ['1.234.567,89', 1234567.89],
      ['-12,50', null],
      ['12', 12],
      ['0,250', 250],
      ['1 500', 1500],
      ['12.50 EUR', 12.5],
      ['EUR12', 12],
      ['3,4,5', 345],
      ['1.2.3', 123],
      [' 7 ', 7],
    ];
    for (const [texte, attendu] of cas) {
      const lu = readMenuPrice(texte, 'EUR');
      expect(lu.ok ? lu.price : null).toBe(attendu);
    }
  });
});

// Contre-audit 4.
describe('readMenuPrice: regles du contre-audit 4', () => {
  // Defaut 2: cas que SEULE la regle "tabulation et retour a la ligne ne sont
  // jamais des separateurs" refuse (remplaces par un espace, ils donneraient
  // "1 500", lu 1500).
  it.each(['XOF', 'XAF', 'EUR'])('%s: "1\n500", "1\t500", "1\r\n500" refuses ; "1 500" lu', (c) => {
    for (const texte of ['1\n500', '1\t500', '1\r\n500']) {
      expect(readMenuPrice(texte, c)).toEqual({ ok: false, reason: 'illisible' });
    }
    expect(readMenuPrice('1 500', c)).toEqual({ ok: true, price: 1500 });
  });

  it.each(['XOF', 'XAF', 'EUR'])('%s: "0 500" illisible', (c) => {
    expect(readMenuPrice('0 500', c)).toEqual({ ok: false, reason: 'illisible' });
  });

  it('"0", "0,5", "0.25" gardent leur lecture', () => {
    expect(readMenuPrice('0', 'XOF')).toEqual({ ok: false, reason: 'negatif_ou_nul' });
    expect(readMenuPrice('0,5', 'XOF')).toEqual({ ok: false, reason: 'decimale' });
    expect(readMenuPrice('0,5', 'EUR')).toEqual({ ok: true, price: 0.5 });
    expect(readMenuPrice('0.25', 'EUR')).toEqual({ ok: true, price: 0.25 });
  });

  it.each(['XOF', 'XAF', 'EUR'])(
    '%s: une unite qui n est pas une monnaie fait refuser le prix',
    (c) => {
      for (const texte of ['33 cl', 'x2', '2 pieces', '1,5 L', '500 g', '2 portions']) {
        expect(readMenuPrice(texte, c)).toEqual({ ok: false, reason: 'illisible' });
      }
    },
  );

  // Ecritures constatees "lues juste" par les contre-audits 3 et 4: aucune ne
  // change.
  it.each(['XOF', 'XAF'])('%s: serie de reference inchangee', (c) => {
    const cas: Array<[string, number]> = [
      ['1 500', 1500],
      ['1\u00a0500', 1500],
      ['1\u202f500', 1500],
      ['1.500', 1500],
      ['12.500 FCFA', 12500],
      ['2500.00', 2500],
      ['2 500,00', 2500],
      ['1500F', 1500],
      ['1500 F CFA', 1500],
      ['CFA 1500', 1500],
      ['1500.-', 1500],
      ['1 500,-', 1500],
      ['2 500\nFCFA', 2500],
      ['1,500,000', 1500000],
      ['00500', 500],
      ['1.000.000,00', 1000000],
      ['25.0', 25],
      ['Prix: 2.500F', 2500],
      ['1 500 000', 1500000],
      ['1 000 FCFA', 1000],
      ['FCFA 1 000', 1000],
      ['1 000 F', 1000],
      ['+500', 500],
      ['1500,-', 1500],
      ['2 500\u00a0F', 2500],
      ['1 000 000,00', 1000000],
      ['1 000 000', 1000000],
      ['1500 XOF', 1500],
      ['XAF 1500', 1500],
    ];
    for (const [texte, attendu] of cas) {
      expect([texte, readMenuPrice(texte, c)]).toEqual([texte, { ok: true, price: attendu }]);
    }
  });

  it('EUR: serie de reference inchangee (dont signe euro et EUR)', () => {
    const cas: Array<[string, number]> = [
      ['1,500.50', 1500.5],
      ['1.500,50', 1500.5],
      ['12,50', 12.5],
      ['12.5', 12.5],
      ['1 000,5', 1000.5],
      ['1 000.50', 1000.5],
      ['10 000.000', 10000000],
      ['1 000,500', 1000500],
      ['\u20ac 1 234,56', 1234.56],
      ['1 234,56 \u20ac', 1234.56],
      ['12.50 EUR', 12.5],
      ['EUR12', 12],
      ['12,50\u20ac', 12.5],
    ];
    for (const [texte, attendu] of cas) {
      expect([texte, readMenuPrice(texte, 'EUR')]).toEqual([texte, { ok: true, price: attendu }]);
    }
  });
});
