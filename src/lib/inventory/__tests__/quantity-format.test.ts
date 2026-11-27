import { describe, it, expect } from 'vitest';
import { roundQuantity, formatQuantity } from '../quantity-format';

describe('roundQuantity', () => {
  it('supprime la queue de virgule flottante (12 - 13.225)', () => {
    expect(12 - 13.225).not.toBe(-1.225);
    expect(roundQuantity(12 - 13.225)).toBe(-1.225);
  });

  it('garde 3 decimales', () => {
    expect(roundQuantity(0.123)).toBe(0.123);
    expect(roundQuantity(0.1234)).toBe(0.123);
    expect(roundQuantity(0.1236)).toBe(0.124);
  });

  it('ne renvoie jamais -0 ni NaN', () => {
    expect(Object.is(roundQuantity(-0.0001), 0)).toBe(true);
    expect(roundQuantity(Number.NaN)).toBe(0);
    expect(roundQuantity(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('formatQuantity', () => {
  it('affiche jusqu a 3 decimales sans zeros inutiles', () => {
    expect(formatQuantity(0.123)).toBe('0.123');
    expect(formatQuantity(12)).toBe('12');
    expect(formatQuantity(2.5)).toBe('2.5');
    expect(formatQuantity(13.2250000001)).toBe('13.225');
  });

  it('arrondit l ecart d un comptage', () => {
    expect(formatQuantity(12 - 13.225)).toBe('-1.225');
  });
});
