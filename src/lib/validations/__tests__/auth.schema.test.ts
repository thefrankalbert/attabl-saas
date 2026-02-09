import { describe, it, expect } from 'vitest';
import { signupSchema, signupOAuthSchema } from '../auth.schema';

describe('signupSchema', () => {
  const validInput = {
    restaurantName: 'Mon Restaurant',
    email: 'test@example.com',
    password: 'securepass123',
  };

  it('should accept valid signup data', () => {
    const result = signupSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should reject short restaurant name', () => {
    const result = signupSchema.safeParse({ ...validInput, restaurantName: 'A' });
    expect(result.success).toBe(false);
  });

  it('should reject restaurant name exceeding 100 characters', () => {
    const result = signupSchema.safeParse({ ...validInput, restaurantName: 'a'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('should reject invalid email', () => {
    const result = signupSchema.safeParse({ ...validInput, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('should reject short password', () => {
    const result = signupSchema.safeParse({ ...validInput, password: '1234567' });
    expect(result.success).toBe(false);
  });

  it('should reject password exceeding 100 characters', () => {
    const result = signupSchema.safeParse({ ...validInput, password: 'a'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('should accept optional phone', () => {
    const result = signupSchema.safeParse({ ...validInput, phone: '+33612345678' });
    expect(result.success).toBe(true);
  });

  it('should accept optional plan "essentiel"', () => {
    const result = signupSchema.safeParse({ ...validInput, plan: 'essentiel' });
    expect(result.success).toBe(true);
  });

  it('should accept optional plan "premium"', () => {
    const result = signupSchema.safeParse({ ...validInput, plan: 'premium' });
    expect(result.success).toBe(true);
  });

  it('should reject invalid plan value', () => {
    const result = signupSchema.safeParse({ ...validInput, plan: 'enterprise' });
    expect(result.success).toBe(false);
  });

  it('should accept when plan is not provided', () => {
    const result = signupSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });
});

describe('signupOAuthSchema', () => {
  const validInput = {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    email: 'oauth@example.com',
    restaurantName: 'OAuth Restaurant',
  };

  it('should accept valid OAuth signup data', () => {
    const result = signupOAuthSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should reject non-UUID userId', () => {
    const result = signupOAuthSchema.safeParse({ ...validInput, userId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('should reject missing userId', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { userId, ...rest } = validInput;
    const result = signupOAuthSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject invalid email', () => {
    const result = signupOAuthSchema.safeParse({ ...validInput, email: 'invalid' });
    expect(result.success).toBe(false);
  });
});
