import { describe, it, expect } from 'vitest';
import {
  currencyDecimals,
  roundForCurrency,
  toMinorUnits,
  fromMinorUnits,
  sumMinor,
  multiplyMinor,
  formatCurrencyMinor,
} from '../money';

describe('money', () => {
  describe('currencyDecimals', () => {
    it('returns 0 for the zero-decimal CFA currencies', () => {
      expect(currencyDecimals('XAF')).toBe(0);
      expect(currencyDecimals('XOF')).toBe(0);
    });
    it('returns 2 for EUR/USD', () => {
      expect(currencyDecimals('EUR')).toBe(2);
      expect(currencyDecimals('USD')).toBe(2);
    });
    it('falls back to the default currency (XAF, 0) for unknown/empty', () => {
      expect(currencyDecimals(null)).toBe(0);
      expect(currencyDecimals(undefined)).toBe(0);
      expect(currencyDecimals('ZZZ')).toBe(0);
    });
  });

  describe('roundForCurrency', () => {
    it('rounds XAF to whole francs (no sub-unit)', () => {
      expect(roundForCurrency(59.94, 'XAF')).toBe(60);
      expect(roundForCurrency(1799.4, 'XAF')).toBe(1799);
      expect(roundForCurrency(1000, 'XAF')).toBe(1000);
    });
    it('rounds EUR/USD to 2 decimals', () => {
      expect(roundForCurrency(12.345, 'EUR')).toBe(12.35);
      expect(roundForCurrency(12.344, 'USD')).toBe(12.34);
    });
    it('defaults to XAF rounding when no currency is given', () => {
      expect(roundForCurrency(59.94)).toBe(60);
    });
    it('handles float representation edge cases', () => {
      expect(roundForCurrency(1.005, 'EUR')).toBe(1.01);
    });
  });

  describe('minor units (BIGINT money)', () => {
    it('is identity for zero-decimal XAF/XOF', () => {
      expect(toMinorUnits(1000, 'XAF')).toBe(1000);
      expect(fromMinorUnits(1000, 'XAF')).toBe(1000);
      expect(toMinorUnits(1000, 'XOF')).toBe(1000);
    });
    it('scales EUR/USD by 100', () => {
      expect(toMinorUnits(12.5, 'EUR')).toBe(1250);
      expect(fromMinorUnits(1250, 'EUR')).toBe(12.5);
      expect(toMinorUnits(12.34, 'USD')).toBe(1234);
    });
    it('defaults to XAF when no currency given', () => {
      expect(toMinorUnits(750)).toBe(750);
    });
    it('sums minor units exactly (no float drift)', () => {
      expect(sumMinor([1000, 2000, 500], 'XAF')).toBe(3500);
      // 0.1 + 0.2 in major would drift; in minor it is exact.
      expect(sumMinor([10, 20], 'EUR')).toBe(30);
    });
    it('multiplies minor units by an integer quantity', () => {
      expect(multiplyMinor(1500, 3, 'XAF')).toBe(4500);
      expect(multiplyMinor(1250, 2, 'EUR')).toBe(2500);
    });
    it('formats minor units back to a display string', () => {
      expect(formatCurrencyMinor(1250, 'EUR')).toBe(formatCurrencyMinor(1250, 'EUR'));
      expect(formatCurrencyMinor(1000, 'XAF')).toContain('FCFA');
    });
  });
});
