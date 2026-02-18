import { describe, it, expect } from 'vitest';
import { createInvitationSchema, acceptInvitationSchema } from '../invitation.schema';

describe('createInvitationSchema', () => {
  it('accepts valid invitation input', () => {
    const result = createInvitationSchema.safeParse({
      email: 'team@restaurant.com',
      role: 'waiter',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = createInvitationSchema.safeParse({
      email: 'not-an-email',
      role: 'waiter',
    });
    expect(result.success).toBe(false);
  });

  it('rejects owner role', () => {
    const result = createInvitationSchema.safeParse({
      email: 'owner@test.com',
      role: 'owner',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all invitable roles', () => {
    const roles = ['admin', 'manager', 'cashier', 'chef', 'waiter'];
    for (const role of roles) {
      const result = createInvitationSchema.safeParse({
        email: 'test@test.com',
        role,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts optional custom_permissions', () => {
    const result = createInvitationSchema.safeParse({
      email: 'test@test.com',
      role: 'waiter',
      custom_permissions: { 'orders.manage': true },
    });
    expect(result.success).toBe(true);
  });
});

describe('acceptInvitationSchema', () => {
  it('accepts valid accept input with password', () => {
    const result = acceptInvitationSchema.safeParse({
      token: 'abc123def456',
      full_name: 'Jean Dupont',
      password: 'SecurePass123!',
    });
    expect(result.success).toBe(true);
  });

  it('rejects short password', () => {
    const result = acceptInvitationSchema.safeParse({
      token: 'abc',
      full_name: 'Jean',
      password: '123',
    });
    expect(result.success).toBe(false);
  });

  it('accepts without password (existing user)', () => {
    const result = acceptInvitationSchema.safeParse({
      token: 'abc123def456',
    });
    expect(result.success).toBe(true);
  });
});
