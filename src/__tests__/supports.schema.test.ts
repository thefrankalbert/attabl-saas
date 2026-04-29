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
  const validRequest = {
    config: validConfig,
    format: 'pdf',
    menuUrl: 'https://lejardin.attabl.com',
    tenantSlug: 'lejardin',
  };

  it('accepts valid pdf export request', () => {
    expect(exportRequestSchema.safeParse(validRequest).success).toBe(true);
  });

  it('accepts valid png export request', () => {
    const result = exportRequestSchema.safeParse({ ...validRequest, format: 'png' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid format', () => {
    const result = exportRequestSchema.safeParse({ ...validRequest, format: 'svg' });
    expect(result.success).toBe(false);
  });

  it('defaults format to pdf when omitted', () => {
    const withoutFormat = {
      config: validRequest.config,
      menuUrl: validRequest.menuUrl,
      tenantSlug: validRequest.tenantSlug,
    };
    const result = exportRequestSchema.safeParse(withoutFormat);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.format).toBe('pdf');
  });
});
