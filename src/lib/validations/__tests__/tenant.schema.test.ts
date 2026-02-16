import { describe, it, expect } from 'vitest';
import { updateTenantSettingsSchema } from '../tenant.schema';

describe('updateTenantSettingsSchema', () => {
  const validInput = {
    name: 'Mon Restaurant',
    primaryColor: '#CCFF00',
    secondaryColor: '#000000',
  };

  it('should accept valid settings', () => {
    const result = updateTenantSettingsSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should reject short name', () => {
    const result = updateTenantSettingsSchema.safeParse({ ...validInput, name: 'A' });
    expect(result.success).toBe(false);
  });

  it('should reject name exceeding 100 characters', () => {
    const result = updateTenantSettingsSchema.safeParse({ ...validInput, name: 'a'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('should accept 3-digit hex colors', () => {
    const result = updateTenantSettingsSchema.safeParse({
      ...validInput,
      primaryColor: '#FFF',
      secondaryColor: '#000',
    });
    expect(result.success).toBe(true);
  });

  it('should accept 6-digit hex colors', () => {
    const result = updateTenantSettingsSchema.safeParse({
      ...validInput,
      primaryColor: '#FF00FF',
      secondaryColor: '#123ABC',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid hex color format', () => {
    const result = updateTenantSettingsSchema.safeParse({
      ...validInput,
      primaryColor: 'red',
    });
    expect(result.success).toBe(false);
  });

  it('should reject hex color without #', () => {
    const result = updateTenantSettingsSchema.safeParse({
      ...validInput,
      primaryColor: 'CCFF00',
    });
    expect(result.success).toBe(false);
  });

  it('should accept optional description', () => {
    const result = updateTenantSettingsSchema.safeParse({
      ...validInput,
      description: 'Un excellent restaurant',
    });
    expect(result.success).toBe(true);
  });

  it('should reject description exceeding 500 characters', () => {
    const result = updateTenantSettingsSchema.safeParse({
      ...validInput,
      description: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('should accept optional address and phone', () => {
    const result = updateTenantSettingsSchema.safeParse({
      ...validInput,
      address: '123 Rue du Test',
      phone: '+33612345678',
    });
    expect(result.success).toBe(true);
  });

  it('should accept empty logoUrl', () => {
    const result = updateTenantSettingsSchema.safeParse({
      ...validInput,
      logoUrl: '',
    });
    expect(result.success).toBe(true);
  });

  it('should accept valid URL for logoUrl', () => {
    const result = updateTenantSettingsSchema.safeParse({
      ...validInput,
      logoUrl: 'https://example.com/logo.png',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid URL for logoUrl', () => {
    const result = updateTenantSettingsSchema.safeParse({
      ...validInput,
      logoUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  // ─── Idle timeout tests ───────────────────────────────

  it('should accept valid idle timeout minutes', () => {
    const result = updateTenantSettingsSchema.safeParse({
      ...validInput,
      idleTimeoutMinutes: 30,
    });
    expect(result.success).toBe(true);
  });

  it('should reject idle timeout below 5 minutes', () => {
    const result = updateTenantSettingsSchema.safeParse({
      ...validInput,
      idleTimeoutMinutes: 2,
    });
    expect(result.success).toBe(false);
  });

  it('should reject idle timeout above 120 minutes', () => {
    const result = updateTenantSettingsSchema.safeParse({
      ...validInput,
      idleTimeoutMinutes: 200,
    });
    expect(result.success).toBe(false);
  });

  it('should accept valid screen lock mode', () => {
    const result = updateTenantSettingsSchema.safeParse({
      ...validInput,
      screenLockMode: 'password',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid screen lock mode', () => {
    const result = updateTenantSettingsSchema.safeParse({
      ...validInput,
      screenLockMode: 'biometric',
    });
    expect(result.success).toBe(false);
  });

  it('should accept null idle timeout (disabled)', () => {
    const result = updateTenantSettingsSchema.safeParse({
      ...validInput,
      idleTimeoutMinutes: null,
    });
    expect(result.success).toBe(true);
  });
});
