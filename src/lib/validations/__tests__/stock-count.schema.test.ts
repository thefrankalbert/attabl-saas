import { describe, it, expect } from 'vitest';
import {
  openStockCountSchema,
  saveStockCountLinesSchema,
  commitStockCountSchema,
  cancelStockCountSchema,
} from '../stock-count.schema';

// Must be valid UUID v4 format (Zod strict: version digit=4, variant=[89ab])
const VALID_UUID = '10000000-0000-4000-8000-000000000001';
const VALID_UUID_2 = '10000000-0000-4000-8000-000000000002';

describe('openStockCountSchema', () => {
  it('accepts minimal valid input (no reference, no ingredientIds)', () => {
    const result = openStockCountSchema.safeParse({ tenantId: VALID_UUID });
    expect(result.success).toBe(true);
  });

  it('accepts optional reference and ingredientIds', () => {
    const result = openStockCountSchema.safeParse({
      tenantId: VALID_UUID,
      reference: 'Inventaire juillet',
      ingredientIds: [VALID_UUID_2],
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-uuid tenantId', () => {
    const result = openStockCountSchema.safeParse({ tenantId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects reference longer than 120 characters', () => {
    const result = openStockCountSchema.safeParse({
      tenantId: VALID_UUID,
      reference: 'a'.repeat(121),
    });
    expect(result.success).toBe(false);
  });

  it('accepts reference of exactly 120 characters', () => {
    const result = openStockCountSchema.safeParse({
      tenantId: VALID_UUID,
      reference: 'a'.repeat(120),
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-uuid ingredient id', () => {
    const result = openStockCountSchema.safeParse({
      tenantId: VALID_UUID,
      ingredientIds: ['not-a-uuid'],
    });
    expect(result.success).toBe(false);
  });
});

describe('saveStockCountLinesSchema', () => {
  it('accepts valid lines with non-null qty', () => {
    const result = saveStockCountLinesSchema.safeParse({
      tenantId: VALID_UUID,
      countId: VALID_UUID_2,
      lines: [{ ingredient_id: VALID_UUID, counted_qty: 5.5 }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts null counted_qty (not yet counted)', () => {
    const result = saveStockCountLinesSchema.safeParse({
      tenantId: VALID_UUID,
      countId: VALID_UUID_2,
      lines: [{ ingredient_id: VALID_UUID, counted_qty: null }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts zero as counted_qty', () => {
    const result = saveStockCountLinesSchema.safeParse({
      tenantId: VALID_UUID,
      countId: VALID_UUID_2,
      lines: [{ ingredient_id: VALID_UUID, counted_qty: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative counted_qty', () => {
    const result = saveStockCountLinesSchema.safeParse({
      tenantId: VALID_UUID,
      countId: VALID_UUID_2,
      lines: [{ ingredient_id: VALID_UUID, counted_qty: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-uuid ingredient_id', () => {
    const result = saveStockCountLinesSchema.safeParse({
      tenantId: VALID_UUID,
      countId: VALID_UUID_2,
      lines: [{ ingredient_id: 'bad', counted_qty: 5 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-uuid tenantId', () => {
    const result = saveStockCountLinesSchema.safeParse({
      tenantId: 'not-a-uuid',
      countId: VALID_UUID_2,
      lines: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-uuid countId', () => {
    const result = saveStockCountLinesSchema.safeParse({
      tenantId: VALID_UUID,
      countId: 'not-a-uuid',
      lines: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('commitStockCountSchema', () => {
  it('accepts valid tenantId and countId', () => {
    const result = commitStockCountSchema.safeParse({
      tenantId: VALID_UUID,
      countId: VALID_UUID_2,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-uuid tenantId', () => {
    const result = commitStockCountSchema.safeParse({
      tenantId: 'bad',
      countId: VALID_UUID_2,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-uuid countId', () => {
    const result = commitStockCountSchema.safeParse({
      tenantId: VALID_UUID,
      countId: 'bad',
    });
    expect(result.success).toBe(false);
  });
});

describe('cancelStockCountSchema', () => {
  it('accepts valid tenantId and countId', () => {
    const result = cancelStockCountSchema.safeParse({
      tenantId: VALID_UUID,
      countId: VALID_UUID_2,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-uuid tenantId', () => {
    const result = cancelStockCountSchema.safeParse({
      tenantId: 'bad',
      countId: VALID_UUID_2,
    });
    expect(result.success).toBe(false);
  });
});
