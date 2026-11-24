import { describe, it, expect } from 'vitest';
import { chevaletConfigSchema, exportRequestSchema } from '@/lib/validations/supports.schema';

const validConfig = {
  unit: 'cm',
  background: '#1A1A1A',
  accentColor: '#FFFFFF',
  logo: { visible: true, x: 1, y: 0.8, width: 2.5 },
  name: { visible: true, x: 1, y: 4, fontSize: 18, text: 'Le Jardin' },
  tagline: { visible: false, x: 1, y: 5.5, fontSize: 10, text: '' },
  qrCode: { x: 14.5, y: 0.8, width: 6, style: 'classic', menuUrl: 'https://lejardin.attabl.com' },
  verso: 'none',
};

describe('chevaletConfigSchema', () => {
  it('accepts valid config', () => {
    expect(chevaletConfigSchema.safeParse(validConfig).success).toBe(true);
  });

  it('rejects invalid hex color for background', () => {
    const result = chevaletConfigSchema.safeParse({ ...validConfig, background: 'red' });
    expect(result.success).toBe(false);
  });

  it('rejects x coordinate out of bounds', () => {
    const result = chevaletConfigSchema.safeParse({
      ...validConfig,
      logo: { ...validConfig.logo, x: 25 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid qrCode style', () => {
    const result = chevaletConfigSchema.safeParse({
      ...validConfig,
      qrCode: { ...validConfig.qrCode, style: 'rainbow' },
    });
    expect(result.success).toBe(false);
  });

  it('reads an old light-on-dark QR style (inverted, dark) as classic', () => {
    for (const style of ['inverted', 'dark']) {
      const r = chevaletConfigSchema.safeParse({
        ...validConfig,
        qrCode: { ...validConfig.qrCode, style },
      });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.qrCode.style).toBe('classic');
    }
  });

  it('rejects invalid verso mode', () => {
    const result = chevaletConfigSchema.safeParse({ ...validConfig, verso: 'both' });
    expect(result.success).toBe(false);
  });

  it('rejects text longer than 200 chars for tagline', () => {
    const result = chevaletConfigSchema.safeParse({
      ...validConfig,
      tagline: { ...validConfig.tagline, text: 'x'.repeat(201) },
    });
    expect(result.success).toBe(false);
  });
});

describe('exportRequestSchema', () => {
  it('accepts a request carrying the configuration', () => {
    expect(exportRequestSchema.safeParse({ config: validConfig }).success).toBe(true);
  });

  it('rejects a request without configuration', () => {
    expect(exportRequestSchema.safeParse({}).success).toBe(false);
  });

  // B29: la route ne produit qu'un PDF; `format`, `menuUrl` et `tenantSlug`
  // etaient exiges puis ignores (`format: 'png'` rendait un PDF).
  it('ne garde que la configuration', () => {
    const result = exportRequestSchema.safeParse({
      config: validConfig,
      format: 'png',
      menuUrl: 'https://lejardin.attabl.com',
      tenantSlug: 'lejardin',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(Object.keys(result.data)).toEqual(['config']);
  });
});
