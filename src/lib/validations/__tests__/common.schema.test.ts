import { describe, expect, it } from 'vitest';
import { parseRouteUuid, routeUuidSchema } from '../common.schema';

describe('routeUuidSchema', () => {
  it('accepts valid UUID', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(routeUuidSchema.safeParse(id).success).toBe(true);
  });

  it('rejects invalid UUID', () => {
    expect(routeUuidSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});

describe('parseRouteUuid', () => {
  it('returns parsed id for valid input', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const result = parseRouteUuid(id);
    expect(result).toEqual({ ok: true, id });
  });

  it('returns error for invalid input', () => {
    const result = parseRouteUuid('bad-id');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('invalide');
    }
  });
});
