import { describe, it, expect } from 'vitest';
import { canGrantRole, canActOnUser } from '../role-hierarchy';

describe('canGrantRole', () => {
  it('owner can grant any role', () => {
    for (const r of ['owner', 'admin', 'manager', 'cashier', 'chef', 'waiter'] as const) {
      expect(canGrantRole('owner', r)).toBe(true);
    }
  });

  it('admin cannot grant admin or owner', () => {
    expect(canGrantRole('admin', 'admin')).toBe(false);
    expect(canGrantRole('admin', 'owner')).toBe(false);
  });

  it('admin can grant roles below admin', () => {
    expect(canGrantRole('admin', 'manager')).toBe(true);
    expect(canGrantRole('admin', 'cashier')).toBe(true);
    expect(canGrantRole('admin', 'chef')).toBe(true);
    expect(canGrantRole('admin', 'waiter')).toBe(true);
  });

  it('manager and below cannot grant any role', () => {
    expect(canGrantRole('manager', 'waiter')).toBe(false);
    expect(canGrantRole('cashier', 'waiter')).toBe(false);
    expect(canGrantRole('chef', 'waiter')).toBe(false);
    expect(canGrantRole('waiter', 'waiter')).toBe(false);
  });

  it('null granter is denied', () => {
    expect(canGrantRole(null, 'waiter')).toBe(false);
  });
});

describe('canActOnUser', () => {
  it('owner outranks admin', () => {
    expect(canActOnUser('owner', 'admin')).toBe(true);
  });

  it('admin cannot act on owner', () => {
    expect(canActOnUser('admin', 'owner')).toBe(false);
  });

  it('same-rank is refused (no self-lockout)', () => {
    expect(canActOnUser('admin', 'admin')).toBe(false);
    expect(canActOnUser('owner', 'owner')).toBe(false);
  });

  it('admin can act on lower ranks', () => {
    expect(canActOnUser('admin', 'manager')).toBe(true);
  });

  it('null actor is denied', () => {
    expect(canActOnUser(null, 'waiter')).toBe(false);
  });

  it('unknown actor role defaults to level 0 and is denied', () => {
    expect(canActOnUser('bogus', 'waiter')).toBe(false);
  });
});
