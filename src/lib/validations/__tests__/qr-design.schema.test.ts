import { describe, it, expect } from 'vitest';
import {
  qrDesignConfigSchema,
  saveQrDesignSchema,
  assignQrDesignSchema,
} from '../qr-design.schema';
import { createDefaultQRDesignConfig } from '@/types/qr-design.types';

const validConfig = createDefaultQRDesignConfig('#CCFF00', '#1A1A1A');

describe('qrDesignConfigSchema', () => {
  it('accepts the factory default config', () => {
    expect(qrDesignConfigSchema.safeParse(validConfig).success).toBe(true);
  });

  it('rejects an invalid hex color', () => {
    const result = qrDesignConfigSchema.safeParse({ ...validConfig, qrFgColor: 'red' });
    expect(result.success).toBe(false);
  });

  it('rejects an out-of-range qrSize', () => {
    const result = qrDesignConfigSchema.safeParse({ ...validConfig, qrSize: 5000 });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown template id', () => {
    const result = qrDesignConfigSchema.safeParse({ ...validConfig, templateId: 'fancy' });
    expect(result.success).toBe(false);
  });

  it('accepts valid perPage tiling values', () => {
    for (const perPage of [1, 2, 4, 'auto'] as const) {
      const result = qrDesignConfigSchema.safeParse({
        ...validConfig,
        printLayout: { ...validConfig.printLayout, perPage },
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an invalid perPage value', () => {
    const result = qrDesignConfigSchema.safeParse({
      ...validConfig,
      printLayout: { ...validConfig.printLayout, perPage: 3 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a message longer than the max length', () => {
    const result = qrDesignConfigSchema.safeParse({
      ...validConfig,
      printLayout: {
        ...validConfig.printLayout,
        message: { enabled: true, text: 'x'.repeat(281) },
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('saveQrDesignSchema', () => {
  it('accepts a named design without id (create)', () => {
    const result = saveQrDesignSchema.safeParse({
      name: 'Salle principale',
      config: validConfig,
      isDefault: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts an update with a uuid id', () => {
    const result = saveQrDesignSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Terrasse',
      config: validConfig,
      isDefault: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    const result = saveQrDesignSchema.safeParse({
      name: '',
      config: validConfig,
      isDefault: false,
    });
    expect(result.success).toBe(false);
  });
});

describe('assignQrDesignSchema', () => {
  it('accepts assigning a design to a zone', () => {
    const result = assignQrDesignSchema.safeParse({
      target: 'zone',
      targetId: '22222222-2222-4222-8222-222222222222',
      designId: '33333333-3333-4333-8333-333333333333',
    });
    expect(result.success).toBe(true);
  });

  it('accepts unassigning (null design)', () => {
    const result = assignQrDesignSchema.safeParse({
      target: 'table',
      targetId: '22222222-2222-4222-8222-222222222222',
      designId: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid target', () => {
    const result = assignQrDesignSchema.safeParse({
      target: 'venue',
      targetId: '22222222-2222-4222-8222-222222222222',
      designId: null,
    });
    expect(result.success).toBe(false);
  });
});
