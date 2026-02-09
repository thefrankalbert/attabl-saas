import { describe, it, expect } from 'vitest';
import { onboardingSaveSchema, onboardingCompleteSchema } from '../onboarding.schema';

describe('onboardingSaveSchema', () => {
  it('should accept valid save data', () => {
    const result = onboardingSaveSchema.safeParse({
      step: 1,
      data: { establishmentType: 'restaurant' },
    });
    expect(result.success).toBe(true);
  });

  it('should reject step below 1', () => {
    const result = onboardingSaveSchema.safeParse({
      step: 0,
      data: {},
    });
    expect(result.success).toBe(false);
  });

  it('should reject step above 4', () => {
    const result = onboardingSaveSchema.safeParse({
      step: 5,
      data: {},
    });
    expect(result.success).toBe(false);
  });

  it('should reject non-integer step', () => {
    const result = onboardingSaveSchema.safeParse({
      step: 1.5,
      data: {},
    });
    expect(result.success).toBe(false);
  });

  it('should accept empty data object', () => {
    const result = onboardingSaveSchema.safeParse({
      step: 2,
      data: {},
    });
    expect(result.success).toBe(true);
  });

  it('should accept data with various fields', () => {
    const result = onboardingSaveSchema.safeParse({
      step: 1,
      data: {
        establishmentType: 'hotel',
        address: '123 Rue Test',
        city: 'Paris',
        tableCount: 20,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('onboardingCompleteSchema', () => {
  it('should accept valid complete data with all fields', () => {
    const result = onboardingCompleteSchema.safeParse({
      data: {
        establishmentType: 'restaurant',
        address: '123 Rue du Menu',
        city: "N'Djamena",
        country: 'Tchad',
        phone: '+23512345678',
        tableCount: 10,
        logoUrl: 'https://example.com/logo.png',
        primaryColor: '#CCFF00',
        secondaryColor: '#000000',
        description: 'Un restaurant test',
        tenantSlug: 'mon-restaurant',
        menuItems: [
          { name: 'Pizza', price: 5000, category: 'Plats' },
          { name: 'Salade', price: 3000 },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('should accept minimal data (all fields optional)', () => {
    const result = onboardingCompleteSchema.safeParse({
      data: {},
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid hex color', () => {
    const result = onboardingCompleteSchema.safeParse({
      data: { primaryColor: 'not-a-color' },
    });
    expect(result.success).toBe(false);
  });

  it('should reject tableCount exceeding 500', () => {
    const result = onboardingCompleteSchema.safeParse({
      data: { tableCount: 501 },
    });
    expect(result.success).toBe(false);
  });

  it('should reject negative tableCount', () => {
    const result = onboardingCompleteSchema.safeParse({
      data: { tableCount: -1 },
    });
    expect(result.success).toBe(false);
  });

  it('should reject more than 50 menu items', () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ name: `Item ${i}`, price: 100 }));
    const result = onboardingCompleteSchema.safeParse({
      data: { menuItems: items },
    });
    expect(result.success).toBe(false);
  });

  it('should accept empty logoUrl string', () => {
    const result = onboardingCompleteSchema.safeParse({
      data: { logoUrl: '' },
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid logoUrl', () => {
    const result = onboardingCompleteSchema.safeParse({
      data: { logoUrl: 'not-a-url' },
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing data wrapper', () => {
    const result = onboardingCompleteSchema.safeParse({
      establishmentType: 'restaurant',
    });
    expect(result.success).toBe(false);
  });
});
