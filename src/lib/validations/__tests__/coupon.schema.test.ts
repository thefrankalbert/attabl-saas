import { describe, it, expect } from 'vitest';
import { couponCodeSchema, couponPayloadSchema } from '../coupon.schema';

describe('couponCodeSchema', () => {
  it('uppercases and trims a valid code', () => {
    expect(couponCodeSchema.parse('  bienvenue10 ')).toBe('BIENVENUE10');
    expect(couponCodeSchema.parse('ete-2026')).toBe('ETE-2026');
  });

  it('refuses spaces, punctuation and accents', () => {
    for (const bad of ['zz derniers!', 'PROMO 10', 'ETE_26', 'CAFE\u00c9', 'a/b-c']) {
      expect(couponCodeSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('enforces 3 to 20 characters', () => {
    expect(couponCodeSchema.safeParse('AB').success).toBe(false);
    expect(couponCodeSchema.safeParse('ABC').success).toBe(true);
    expect(couponCodeSchema.safeParse('A'.repeat(20)).success).toBe(true);
    expect(couponCodeSchema.safeParse('A'.repeat(21)).success).toBe(false);
  });
});

describe('couponPayloadSchema', () => {
  const base = { code: 'promo10', discount_type: 'percentage', discount_value: 10 };

  it('normalizes the code server-side', () => {
    expect(couponPayloadSchema.parse(base).code).toBe('PROMO10');
  });

  it('refuses a malformed code and a zero value', () => {
    expect(couponPayloadSchema.safeParse({ ...base, code: 'zz derniers!' }).success).toBe(false);
    expect(couponPayloadSchema.safeParse({ ...base, discount_value: 0 }).success).toBe(false);
  });
});
