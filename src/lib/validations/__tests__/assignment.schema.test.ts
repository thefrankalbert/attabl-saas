import { describe, it, expect } from 'vitest';
import { createAssignmentSchema, claimOrderSchema } from '../assignment.schema';

describe('createAssignmentSchema', () => {
  it('accepts valid input', () => {
    const result = createAssignmentSchema.safeParse({
      table_id: '550e8400-e29b-41d4-a716-446655440000',
      server_id: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing table_id', () => {
    const result = createAssignmentSchema.safeParse({
      server_id: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID for table_id', () => {
    const result = createAssignmentSchema.safeParse({
      table_id: 'not-a-uuid',
      server_id: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID for server_id', () => {
    const result = createAssignmentSchema.safeParse({
      table_id: '550e8400-e29b-41d4-a716-446655440000',
      server_id: 'bad',
    });
    expect(result.success).toBe(false);
  });
});

describe('claimOrderSchema', () => {
  it('accepts valid server_id', () => {
    const result = claimOrderSchema.safeParse({
      server_id: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing server_id', () => {
    const result = claimOrderSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID', () => {
    const result = claimOrderSchema.safeParse({ server_id: 'nope' });
    expect(result.success).toBe(false);
  });
});
