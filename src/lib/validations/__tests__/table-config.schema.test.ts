import { describe, it, expect } from 'vitest';
import { zoneSchema, tableConfigSchema, addTablesSchema } from '../table-config.schema';

describe('zoneSchema', () => {
  it('accepts valid zone', () => {
    const result = zoneSchema.safeParse({
      name: 'Interieur',
      prefix: 'INT',
      tableCount: 10,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = zoneSchema.safeParse({
      name: '',
      prefix: 'INT',
      tableCount: 5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects prefix longer than 5 chars', () => {
    const result = zoneSchema.safeParse({
      name: 'Interieur',
      prefix: 'INTERIEUR',
      tableCount: 5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero tables', () => {
    const result = zoneSchema.safeParse({
      name: 'Terrasse',
      prefix: 'TER',
      tableCount: 0,
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional capacity', () => {
    const result = zoneSchema.safeParse({
      name: 'VIP',
      prefix: 'VIP',
      tableCount: 4,
      defaultCapacity: 6,
    });
    expect(result.success).toBe(true);
  });
});

describe('tableConfigSchema', () => {
  it('accepts array of zones', () => {
    const result = tableConfigSchema.safeParse({
      zones: [
        { name: 'Interieur', prefix: 'INT', tableCount: 10 },
        { name: 'Terrasse', prefix: 'TER', tableCount: 8 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty zones array', () => {
    const result = tableConfigSchema.safeParse({ zones: [] });
    expect(result.success).toBe(false);
  });

  it('rejects more than 20 zones', () => {
    const zones = Array.from({ length: 21 }, (_, i) => ({
      name: `Zone ${i}`,
      prefix: `Z${i}`,
      tableCount: 1,
    }));
    const result = tableConfigSchema.safeParse({ zones });
    expect(result.success).toBe(false);
  });
});

describe('addTablesSchema', () => {
  it('accepts valid add tables input', () => {
    const result = addTablesSchema.safeParse({
      zone_id: '123e4567-e89b-12d3-a456-426614174000',
      count: 5,
      capacity: 4,
    });
    expect(result.success).toBe(true);
  });

  it('rejects count above 50', () => {
    const result = addTablesSchema.safeParse({
      zone_id: '123e4567-e89b-12d3-a456-426614174000',
      count: 51,
      capacity: 2,
    });
    expect(result.success).toBe(false);
  });
});
