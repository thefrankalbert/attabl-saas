import { describe, it, expect } from 'vitest';
import { calculateTax, calculateServiceCharge, calculateOrderTotal, validateTotal } from '../tax';

describe('calculateTax', () => {
  it('returns 0 when tax is disabled', () => {
    expect(calculateTax(10000, { enable_tax: false, tax_rate: 18 })).toBe(0);
  });

  it('returns 0 when tax_rate is 0', () => {
    expect(calculateTax(10000, { enable_tax: true, tax_rate: 0 })).toBe(0);
  });

  it('returns 0 when tax_rate is negative', () => {
    expect(calculateTax(10000, { enable_tax: true, tax_rate: -5 })).toBe(0);
  });

  it('calculates 18% tax correctly', () => {
    expect(calculateTax(10000, { enable_tax: true, tax_rate: 18 })).toBe(1800);
  });

  it('rounds to 2 decimal places for a 2-decimal currency (EUR)', () => {
    // 33.33 * 7 / 100 = 2.3331 -> 2.33 for EUR
    expect(calculateTax(33.33, { enable_tax: true, tax_rate: 7 }, 'EUR')).toBe(2.33);
  });

  it('rounds to whole units for a zero-decimal currency (XAF, the default)', () => {
    // 333 * 18 / 100 = 59.94 -> 60 for XAF (no centimes)
    expect(calculateTax(333, { enable_tax: true, tax_rate: 18 }, 'XAF')).toBe(60);
    // default (no currency) behaves as XAF
    expect(calculateTax(333, { enable_tax: true, tax_rate: 18 })).toBe(60);
  });
});

describe('calculateServiceCharge', () => {
  it('returns 0 when service charge is disabled', () => {
    expect(
      calculateServiceCharge(10000, { enable_service_charge: false, service_charge_rate: 10 }),
    ).toBe(0);
  });

  it('calculates 10% service charge correctly', () => {
    expect(
      calculateServiceCharge(10000, { enable_service_charge: true, service_charge_rate: 10 }),
    ).toBe(1000);
  });
});

describe('calculateOrderTotal', () => {
  it('calculates full breakdown with tax + service charge', () => {
    const result = calculateOrderTotal(10000, {
      enable_tax: true,
      tax_rate: 18,
      enable_service_charge: true,
      service_charge_rate: 10,
    });
    expect(result).toEqual({
      subtotal: 10000,
      taxAmount: 1800,
      serviceChargeAmount: 1000,
      discountAmount: 0,
      total: 12800,
    });
  });

  it('computes tax and service on the discounted base (post-discount)', () => {
    const result = calculateOrderTotal(
      10000,
      {
        enable_tax: true,
        tax_rate: 18,
        enable_service_charge: true,
        service_charge_rate: 10,
      },
      2000,
    );
    // taxable base = 10000 - 2000 = 8000
    expect(result).toEqual({
      subtotal: 10000,
      taxAmount: 1440,
      serviceChargeAmount: 800,
      discountAmount: 2000,
      total: 10240,
    });
  });

  it('applies discount and ensures total >= 0', () => {
    const result = calculateOrderTotal(
      100,
      { enable_tax: false, enable_service_charge: false },
      200,
    );
    expect(result.total).toBe(0);
  });

  it('defaults discountAmount to 0', () => {
    const result = calculateOrderTotal(500, { enable_tax: false });
    expect(result.discountAmount).toBe(0);
    expect(result.total).toBe(500);
  });
});

describe('validateTotal', () => {
  it('validates exact match', () => {
    expect(validateTotal(1000, 1000)).toBe(true);
  });

  it('allows 1% tolerance', () => {
    expect(validateTotal(1005, 1000)).toBe(true);
  });

  it('rejects beyond tolerance', () => {
    expect(validateTotal(1020, 1000)).toBe(false);
  });

  it('handles zero totals', () => {
    expect(validateTotal(0, 0)).toBe(true);
    expect(validateTotal(1, 0)).toBe(false);
  });
});
