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

  it('should reject step above 6', () => {
    const result = onboardingSaveSchema.safeParse({
      step: 7,
      data: {},
    });
    expect(result.success).toBe(false);
  });

  it('should accept step 6', () => {
    const result = onboardingSaveSchema.safeParse({
      step: 6,
      data: {},
    });
    expect(result.success).toBe(true);
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

  it('should strip unknown keys from data (prevents unbounded storage)', () => {
    const result = onboardingSaveSchema.safeParse({
      step: 1,
      data: {
        tenantName: 'Mon resto',
        arbitraryKey: 'A'.repeat(100000),
        anotherUnknown: { nested: true },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data).not.toHaveProperty('arbitraryKey');
      expect(result.data.data).not.toHaveProperty('anotherUnknown');
      expect(result.data.data.tenantName).toBe('Mon resto');
    }
  });

  it('should reject tenantName exceeding 200 chars', () => {
    const result = onboardingSaveSchema.safeParse({
      step: 1,
      data: { tenantName: 'A'.repeat(201) },
    });
    expect(result.success).toBe(false);
  });

  it('should reject address exceeding 200 chars', () => {
    const result = onboardingSaveSchema.safeParse({
      step: 1,
      data: { address: 'A'.repeat(201) },
    });
    expect(result.success).toBe(false);
  });

  it('should reject description exceeding 500 chars', () => {
    const result = onboardingSaveSchema.safeParse({
      step: 3,
      data: { description: 'A'.repeat(501) },
    });
    expect(result.success).toBe(false);
  });

  it('should reject more than 50 menu items in draft', () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ name: `Item ${i}`, price: 100 }));
    const result = onboardingSaveSchema.safeParse({
      step: 4,
      data: { menuItems: items },
    });
    expect(result.success).toBe(false);
  });

  it('should reject more than 20 table zones in draft', () => {
    const zones = Array.from({ length: 21 }, (_, i) => ({
      name: `Zone ${i}`,
      prefix: 'T',
      tableCount: 5,
    }));
    const result = onboardingSaveSchema.safeParse({
      step: 2,
      data: { tableZones: zones },
    });
    expect(result.success).toBe(false);
  });

  it('should accept navigation metadata fields (_phase, _subScreen)', () => {
    const result = onboardingSaveSchema.safeParse({
      step: 2,
      data: { _phase: 1, _subScreen: 2, tenantName: 'Test' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data._phase).toBe(1);
      expect(result.data.data._subScreen).toBe(2);
    }
  });

  it('should accept partial hex color (mid-typing) without regex rejection', () => {
    const result = onboardingSaveSchema.safeParse({
      step: 3,
      data: { primaryColor: '#00' },
    });
    expect(result.success).toBe(true);
  });

  it('should reject primaryColor exceeding 7 chars', () => {
    const result = onboardingSaveSchema.safeParse({
      step: 3,
      data: { primaryColor: '#AABBCCDD' },
    });
    expect(result.success).toBe(false);
  });

  it('should accept all QR customization fields', () => {
    const result = onboardingSaveSchema.safeParse({
      step: 5,
      data: {
        qrTemplate: 'standard',
        qrStyle: 'classic',
        qrCta: 'Scannez pour commander',
        qrDescription: 'Menu disponible ici',
      },
    });
    expect(result.success).toBe(true);
  });

  it('should reject qrCta exceeding 200 chars', () => {
    const result = onboardingSaveSchema.safeParse({
      step: 5,
      data: { qrCta: 'A'.repeat(201) },
    });
    expect(result.success).toBe(false);
  });

  it('should accept type-specific optional fields', () => {
    const result = onboardingSaveSchema.safeParse({
      step: 1,
      data: {
        starRating: 4,
        hasRestaurant: true,
        hasTerrace: false,
        hasWifi: true,
        totalCapacity: 120,
      },
    });
    expect(result.success).toBe(true);
  });

  it('should reject starRating above 5', () => {
    const result = onboardingSaveSchema.safeParse({
      step: 1,
      data: { starRating: 6 },
    });
    expect(result.success).toBe(false);
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
        primaryColor: '#006AFF',
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

  it('should accept any string for logoUrl (URLs validated at storage level)', () => {
    const result = onboardingCompleteSchema.safeParse({
      data: { logoUrl: 'not-a-url' },
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing data wrapper', () => {
    const result = onboardingCompleteSchema.safeParse({
      establishmentType: 'restaurant',
    });
    expect(result.success).toBe(false);
  });
});
