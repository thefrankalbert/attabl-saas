import { describe, it, expect } from 'vitest';
import { convertToBaseUnit, isSiConvertible } from '@/lib/inventory/unit-conversion';

describe('convertToBaseUnit', () => {
  it('converts count purchase units via units_per_purchase (2 casier -> 48 bouteille)', () => {
    expect(
      convertToBaseUnit({
        quantity: 2,
        baseUnit: 'bouteille',
        purchaseUnit: 'casier',
        unitsPerPurchase: 24,
      }),
    ).toBe(48);
  });

  it('converts a sac of 5 kg (3 sac -> 15 kg)', () => {
    expect(
      convertToBaseUnit({ quantity: 3, baseUnit: 'kg', purchaseUnit: 'sac', unitsPerPurchase: 5 }),
    ).toBe(15);
  });

  it('SI path: 500 g into base kg -> 0.5', () => {
    expect(
      convertToBaseUnit({ quantity: 500, baseUnit: 'kg', purchaseUnit: 'g', unitsPerPurchase: 1 }),
    ).toBe(0.5);
  });

  it('SI path: 150 cl into base L -> 1.5', () => {
    expect(
      convertToBaseUnit({ quantity: 150, baseUnit: 'L', purchaseUnit: 'cl', unitsPerPurchase: 1 }),
    ).toBe(1.5);
  });

  it('identity when purchaseUnit is null', () => {
    expect(
      convertToBaseUnit({ quantity: 7, baseUnit: 'kg', purchaseUnit: null, unitsPerPurchase: 24 }),
    ).toBe(7);
  });

  it('identity when purchaseUnit equals baseUnit (factor ignored)', () => {
    expect(
      convertToBaseUnit({ quantity: 7, baseUnit: 'kg', purchaseUnit: 'kg', unitsPerPurchase: 24 }),
    ).toBe(7);
  });

  it('rounds to 3 decimals for a fractional factor (1 sac * 5.333 -> 5.333)', () => {
    expect(
      convertToBaseUnit({
        quantity: 1,
        baseUnit: 'kg',
        purchaseUnit: 'sac',
        unitsPerPurchase: 5.333,
      }),
    ).toBe(5.333);
  });

  it('rounds a repeating product to 3 decimals', () => {
    // 3 * 1.0005 = 3.0015 -> 3.002 (rounded to 3 dp)
    expect(
      convertToBaseUnit({
        quantity: 3,
        baseUnit: 'kg',
        purchaseUnit: 'sac',
        unitsPerPurchase: 1.0005,
      }),
    ).toBe(3.002);
  });

  it('quantity 0 -> 0', () => {
    expect(
      convertToBaseUnit({
        quantity: 0,
        baseUnit: 'bouteille',
        purchaseUnit: 'casier',
        unitsPerPurchase: 24,
      }),
    ).toBe(0);
  });

  it('throws RangeError on negative quantity', () => {
    expect(() =>
      convertToBaseUnit({
        quantity: -1,
        baseUnit: 'kg',
        purchaseUnit: 'sac',
        unitsPerPurchase: 5,
      }),
    ).toThrow(RangeError);
  });

  it('throws RangeError when unitsPerPurchase <= 0', () => {
    expect(() =>
      convertToBaseUnit({ quantity: 1, baseUnit: 'kg', purchaseUnit: 'sac', unitsPerPurchase: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      convertToBaseUnit({ quantity: 1, baseUnit: 'kg', purchaseUnit: 'sac', unitsPerPurchase: -5 }),
    ).toThrow(RangeError);
  });

  it('strict SI gating: a mislabeled SI purchase unit on a non-matching dimension falls back to units_per_purchase', () => {
    // purchase_unit 'g' (mass) on a base 'L' (volume) must NOT cross-convert;
    // it falls back to the count path: 2 * 6 = 12.
    expect(
      convertToBaseUnit({ quantity: 2, baseUnit: 'L', purchaseUnit: 'g', unitsPerPurchase: 6 }),
    ).toBe(12);
  });

  it('strict SI gating: non-SI base with SI-looking purchase unit uses units_per_purchase', () => {
    // base 'bouteille' (count), purchase 'cl' (volume) -> no SI path, use factor.
    expect(
      convertToBaseUnit({
        quantity: 2,
        baseUnit: 'bouteille',
        purchaseUnit: 'cl',
        unitsPerPurchase: 4,
      }),
    ).toBe(8);
  });
});

describe('isSiConvertible', () => {
  it('true for same-dimension SI pairs', () => {
    expect(isSiConvertible('g', 'kg')).toBe(true);
    expect(isSiConvertible('kg', 'g')).toBe(true);
    expect(isSiConvertible('cl', 'L')).toBe(true);
    expect(isSiConvertible('L', 'cl')).toBe(true);
  });

  it('false across dimensions (mass vs volume)', () => {
    expect(isSiConvertible('g', 'L')).toBe(false);
    expect(isSiConvertible('cl', 'kg')).toBe(false);
  });

  it('false when either unit is not SI-known', () => {
    expect(isSiConvertible('casier', 'kg')).toBe(false);
    expect(isSiConvertible('bouteille', 'piece')).toBe(false);
  });
});
