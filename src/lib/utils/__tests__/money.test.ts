import { describe, it, expect } from 'vitest';
import { currencyDecimals, roundForCurrency } from '../money';

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
});
