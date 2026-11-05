import { describe, it, expect } from 'vitest';
import {
  normalizeHeader,
  mapHeaders,
  parseNumericCell,
  parseBooleanCell,
  isEmptyRow,
} from '@/lib/excel-parse';

describe('normalizeHeader', () => {
  it('lowercases, strips accents and whitespace', () => {
    expect(normalizeHeader('  Téléphone ')).toBe('telephone');
    expect(normalizeHeader('Nom du Plat')).toBe('nomduplat');
    expect(normalizeHeader('UNITÉ')).toBe('unite');
  });
});

describe('mapHeaders', () => {
  const aliases = {
    name: ['name', 'nom'],
    phone: ['phone', 'telephone'],
  };

  it('maps recognised headers to canonical fields by column index', () => {
    const m = mapHeaders(aliases, ['Nom', 'Téléphone', 'Ignored']);
    expect(m.get(0)).toBe('name');
    expect(m.get(1)).toBe('phone');
    expect(m.has(2)).toBe(false);
  });

  it('keeps the first column for a duplicated field', () => {
    const m = mapHeaders(aliases, ['Name', 'Nom']);
    expect(m.get(0)).toBe('name');
    expect(m.has(1)).toBe(false);
  });
});

describe('parseNumericCell', () => {
  it('handles numbers, comma decimals, currency prefixes, empty and null', () => {
    expect(parseNumericCell(12.5)).toBe(12.5);
    expect(parseNumericCell('12,50')).toBe(12.5);
    expect(parseNumericCell('$12.50')).toBe(12.5);
    expect(parseNumericCell('')).toBeNull();
    expect(parseNumericCell(null)).toBeNull();
    expect(parseNumericCell('abc')).toBeNull();
  });

  it('rejects non-finite numbers', () => {
    expect(parseNumericCell(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseNumericCell(NaN)).toBeNull();
  });

  /**
   * Non-regression du defaut du 2026-08-14. L'ancienne lecture remplacait la
   * PREMIERE virgule par un point: "1,500" - ce qu'ecrit Excel en locale
   * anglaise pour 1500 - donnait 1.5. Les prix importes etaient divises par
   * mille, en silence, puisque 1.5 reste un nombre positif valide.
   */
  describe('separateur de milliers', () => {
    it('lit un millier ecrit a l anglaise', () => {
      expect(parseNumericCell('1,500')).toBe(1500);
      expect(parseNumericCell('25,000')).toBe(25000);
      expect(parseNumericCell('1,234,567')).toBe(1234567);
    });

    it('lit un millier ecrit a l europeenne', () => {
      expect(parseNumericCell('1.500')).toBe(1500);
      expect(parseNumericCell('1.234.567')).toBe(1234567);
    });

    it('lit les deux separateurs a la fois, le dernier etant le decimal', () => {
      expect(parseNumericCell('1,234.56')).toBe(1234.56);
      expect(parseNumericCell('1.234,56')).toBe(1234.56);
      expect(parseNumericCell('1.500,75')).toBe(1500.75);
    });

    it('lit encore les decimales simples', () => {
      // Le correctif ne doit pas casser le cas d'origine: un ou deux chiffres
      // apres le separateur restent des decimales.
      expect(parseNumericCell('12,50')).toBe(12.5);
      expect(parseNumericCell('12.50')).toBe(12.5);
      expect(parseNumericCell('12,5')).toBe(12.5);
    });

    it('conserve le signe negatif au lieu de le faire disparaitre', () => {
      // Le supprimer transformerait une faute de saisie en valeur valide; le
      // garder laisse la validation la refuser.
      expect(parseNumericCell('-500')).toBe(-500);
      expect(parseNumericCell('-1,500')).toBe(-1500);
    });

    it('accepte un montant accompagne de sa devise', () => {
      expect(parseNumericCell('2 500 FCFA')).toBe(2500);
      expect(parseNumericCell('1 500')).toBe(1500);
    });

    it('rend null quand il ne reste aucun chiffre', () => {
      expect(parseNumericCell('FCFA')).toBeNull();
      expect(parseNumericCell('---')).toBeNull();
    });
  });
});

describe('parseBooleanCell', () => {
  it('parses common FR/EN truthy and falsy tokens', () => {
    for (const v of ['Oui', 'Y', 'yes', '1', 'true', 'V']) {
      expect(parseBooleanCell(v, false)).toBe(true);
    }
    for (const v of ['Non', 'N', 'no', '0', 'false', 'X']) {
      expect(parseBooleanCell(v, true)).toBe(false);
    }
  });

  it('returns the default for empty or unrecognised values', () => {
    expect(parseBooleanCell('', true)).toBe(true);
    expect(parseBooleanCell(null, false)).toBe(false);
    expect(parseBooleanCell('maybe', true)).toBe(true);
  });

  it('coerces booleans and numbers directly', () => {
    expect(parseBooleanCell(true, false)).toBe(true);
    expect(parseBooleanCell(0, true)).toBe(false);
    expect(parseBooleanCell(3, false)).toBe(true);
  });
});

describe('isEmptyRow', () => {
  it('detects fully empty rows', () => {
    expect(isEmptyRow(undefined)).toBe(true);
    expect(isEmptyRow([])).toBe(true);
    expect(isEmptyRow([null, undefined, ''])).toBe(true);
    expect(isEmptyRow(['', 'x'])).toBe(false);
  });
});
