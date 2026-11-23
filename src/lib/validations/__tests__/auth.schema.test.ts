import { describe, it, expect } from 'vitest';
import { signupSchema } from '../auth.schema';

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

  it('should accept optional plan "starter"', () => {
    const result = signupSchema.safeParse({ ...validInput, plan: 'starter' });
    expect(result.success).toBe(true);
  });

  it('should accept optional plan "pro"', () => {
    const result = signupSchema.safeParse({ ...validInput, plan: 'pro' });
    expect(result.success).toBe(true);
  });

  it('should accept optional plan "business"', () => {
    const result = signupSchema.safeParse({ ...validInput, plan: 'business' });
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
