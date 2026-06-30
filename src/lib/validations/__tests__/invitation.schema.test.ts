import { describe, it, expect } from 'vitest';
import {
  createInvitationSchema,
  acceptInvitationSchema,
  validateInvitationSchema,
} from '../invitation.schema';

const VALID_TOKEN = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

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
  it('accepts valid accept input with name and password', () => {
    const result = acceptInvitationSchema.safeParse({
      token: VALID_TOKEN,
      full_name: 'Jean Dupont',
      password: 'SecurePass123!',
    });
    expect(result.success).toBe(true);
  });

  it('rejects short password', () => {
    const result = acceptInvitationSchema.safeParse({
      token: VALID_TOKEN,
      full_name: 'Jean',
      password: '123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects token-only payload: full_name and password are required', () => {
    // Regression guard: the broken on-mount call sent { token, validate_only }
    // with no credentials and slipped through to acceptInvitation(). Use
    // validateInvitationSchema (GET /validate) for the read-only check instead.
    const result = acceptInvitationSchema.safeParse({ token: VALID_TOKEN });
    expect(result.success).toBe(false);
  });

  it('rejects missing full_name', () => {
    const result = acceptInvitationSchema.safeParse({
      token: VALID_TOKEN,
      password: 'SecurePass123!',
    });
    expect(result.success).toBe(false);
  });
});

describe('validateInvitationSchema', () => {
  it('accepts a token-only payload', () => {
    const result = validateInvitationSchema.safeParse({ token: VALID_TOKEN });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed token', () => {
    expect(validateInvitationSchema.safeParse({ token: 'abc' }).success).toBe(false);
    expect(validateInvitationSchema.safeParse({ token: null }).success).toBe(false);
  });
});
