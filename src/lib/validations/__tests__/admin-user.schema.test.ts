import { describe, it, expect } from 'vitest';
import { createAdminUserSchema } from '../admin-user.schema';

describe('createAdminUserSchema', () => {
  const validInput = {
    email: 'test@example.com',
    password: 'securepass123',
    full_name: 'Jean Dupont',
    role: 'admin' as const,
  };

  it('should accept valid input', () => {
    const result = createAdminUserSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should reject invalid email', () => {
    const result = createAdminUserSchema.safeParse({ ...validInput, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('should reject short password (under 8 chars)', () => {
    const result = createAdminUserSchema.safeParse({ ...validInput, password: '1234567' });
    expect(result.success).toBe(false);
  });

  it('should reject short full_name (under 2 chars)', () => {
    const result = createAdminUserSchema.safeParse({ ...validInput, full_name: 'A' });
    expect(result.success).toBe(false);
  });

  it('should reject missing role', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { role: _, ...noRole } = validInput;
    const result = createAdminUserSchema.safeParse(noRole);
    expect(result.success).toBe(false);
  });

  it('should accept all 6 valid roles', () => {
    const roles = ['owner', 'admin', 'manager', 'cashier', 'chef', 'waiter'] as const;
    for (const role of roles) {
      const result = createAdminUserSchema.safeParse({ ...validInput, role });
      expect(result.success).toBe(true);
    }
  });

  it('should reject an invalid role', () => {
    const result = createAdminUserSchema.safeParse({ ...validInput, role: 'superuser' });
    expect(result.success).toBe(false);
  });

  it('should reject missing email', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { email: _, ...noEmail } = validInput;
    const result = createAdminUserSchema.safeParse(noEmail);
    expect(result.success).toBe(false);
  });
});
