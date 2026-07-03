import { describe, it, expect } from 'vitest';
import { compOrderSchema, orderNoteSchema, houseAccountSchema } from '../house-account.schema';

const UUID = '11111111-1111-4111-a111-111111111111';

describe('compOrderSchema', () => {
  it('accepts a valid comp', () => {
    const r = compOrderSchema.safeParse({ tenantId: UUID, orderId: UUID, reason: 'Geste' });
    expect(r.success).toBe(true);
  });

  it('rejects an empty reason', () => {
    const r = compOrderSchema.safeParse({ tenantId: UUID, orderId: UUID, reason: '   ' });
    expect(r.success).toBe(false);
  });

  it('rejects a reason > 500 chars', () => {
    const r = compOrderSchema.safeParse({ tenantId: UUID, orderId: UUID, reason: 'x'.repeat(501) });
    expect(r.success).toBe(false);
  });

  it('rejects a non-uuid tenant', () => {
    const r = compOrderSchema.safeParse({ tenantId: 'nope', orderId: UUID, reason: 'ok' });
    expect(r.success).toBe(false);
  });
});

describe('orderNoteSchema', () => {
  it('accepts a valid note', () => {
    expect(orderNoteSchema.safeParse({ tenantId: UUID, orderId: UUID, note: 'note' }).success).toBe(
      true,
    );
  });

  it('rejects an empty note', () => {
    expect(orderNoteSchema.safeParse({ tenantId: UUID, orderId: UUID, note: '' }).success).toBe(
      false,
    );
  });

  it('rejects a note > 1000 chars', () => {
    expect(
      orderNoteSchema.safeParse({ tenantId: UUID, orderId: UUID, note: 'x'.repeat(1001) }).success,
    ).toBe(false);
  });
});

describe('houseAccountSchema', () => {
  it('accepts a valid account', () => {
    expect(houseAccountSchema.safeParse({ name: 'Chambre 12' }).success).toBe(true);
  });

  it('accepts an optional description', () => {
    expect(
      houseAccountSchema.safeParse({ name: 'Staff', description: 'repas equipe' }).success,
    ).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(houseAccountSchema.safeParse({ name: '  ' }).success).toBe(false);
  });

  it('rejects a name > 120 chars', () => {
    expect(houseAccountSchema.safeParse({ name: 'x'.repeat(121) }).success).toBe(false);
  });
});
