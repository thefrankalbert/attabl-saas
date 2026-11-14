import { describe, it, expect } from 'vitest';
import { updateAdminUserSchema } from '../admin-user.schema';

describe('updateAdminUserSchema', () => {
  it('accepts a partial update with only full_name', () => {
    expect(updateAdminUserSchema.safeParse({ full_name: 'Awa' }).success).toBe(true);
  });

  it('accepts custom_permissions with known codes', () => {
    const result = updateAdminUserSchema.safeParse({
      custom_permissions: { 'orders.manage': true, 'settings.edit': false },
    });
    expect(result.success).toBe(true);
  });

  it('accepts custom_permissions = null (clears overrides)', () => {
    expect(updateAdminUserSchema.safeParse({ custom_permissions: null }).success).toBe(true);
  });

  it('rejects custom_permissions with an unknown permission code', () => {
    const result = updateAdminUserSchema.safeParse({
      custom_permissions: { 'orders.delete_everything': true },
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-boolean permission values', () => {
    const result = updateAdminUserSchema.safeParse({
      custom_permissions: { 'orders.manage': 'yes' },
    });
    expect(result.success).toBe(false);
  });
});
