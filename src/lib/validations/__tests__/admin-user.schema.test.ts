import { describe, it, expect } from 'vitest';
import { updateAdminUserSchema } from '../admin-user.schema';
import { STAFF_POSTES } from '@/types/permission.types';

describe('updateAdminUserSchema', () => {
  it('accepts a partial update with only full_name', () => {
    expect(updateAdminUserSchema.safeParse({ full_name: 'Awa' }).success).toBe(true);
  });

  it('accepts permission_overrides with known codes', () => {
    const result = updateAdminUserSchema.safeParse({
      permission_overrides: { 'orders.take': true, 'settings.edit': false },
    });
    expect(result.success).toBe(true);
  });

  it('accepts permission_overrides = null (clears overrides)', () => {
    expect(updateAdminUserSchema.safeParse({ permission_overrides: null }).success).toBe(true);
  });

  it('rejects permission_overrides with an unknown permission code', () => {
    const result = updateAdminUserSchema.safeParse({
      permission_overrides: { 'orders.delete_everything': true },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a code that is not in the catalogue of 22', () => {
    expect(
      updateAdminUserSchema.safeParse({ permission_overrides: { 'orders.void_everything': true } })
        .success,
    ).toBe(false);
  });

  it('rejects non-boolean permission values', () => {
    const result = updateAdminUserSchema.safeParse({
      permission_overrides: { 'orders.take': 'yes' },
    });
    expect(result.success).toBe(false);
  });

  describe('postes', () => {
    it('accepts every staff poste alone', () => {
      expect(STAFF_POSTES).toHaveLength(10);
      for (const poste of STAFF_POSTES) {
        expect(updateAdminUserSchema.safeParse({ postes: [poste] }).success).toBe(true);
      }
    });

    it('accepts a cumulation of postes', () => {
      expect(updateAdminUserSchema.safeParse({ postes: ['manager', 'cashier'] }).success).toBe(
        true,
      );
    });

    it('rejects an empty postes list', () => {
      expect(updateAdminUserSchema.safeParse({ postes: [] }).success).toBe(false);
    });

    it('rejects owner, alone or cumulated (temoin: the same list without owner passes)', () => {
      expect(updateAdminUserSchema.safeParse({ postes: ['owner'] }).success).toBe(false);
      expect(updateAdminUserSchema.safeParse({ postes: ['waiter', 'owner'] }).success).toBe(false);
      expect(updateAdminUserSchema.safeParse({ postes: ['waiter'] }).success).toBe(true);
    });

    it('rejects an unknown poste', () => {
      expect(updateAdminUserSchema.safeParse({ postes: ['admin'] }).success).toBe(false);
    });

    it('rejects a duplicate poste', () => {
      expect(updateAdminUserSchema.safeParse({ postes: ['waiter', 'waiter'] }).success).toBe(false);
    });
  });
});
