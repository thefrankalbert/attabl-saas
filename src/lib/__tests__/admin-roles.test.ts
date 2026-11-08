import { describe, expect, it } from 'vitest';
import {
  ASSIGNMENT_MANAGER_ROLES,
  isRoleAllowed,
  ONBOARDING_COMPLETE_ROLES,
  ORDER_MONEY_ROLES,
  ORDER_STAFF_ROLES,
} from '../admin-roles';
import { DEFAULT_PERMISSIONS } from '@/types/permission.types';
import type { AdminRole } from '@/types/admin/enums.types';

const TOUS_LES_ROLES: AdminRole[] = ['owner', 'admin', 'manager', 'cashier', 'chef', 'waiter'];

describe('admin-roles', () => {
  it('allows owner to complete onboarding', () => {
    expect(isRoleAllowed('owner', ONBOARDING_COMPLETE_ROLES)).toBe(true);
  });

  it('denies manager from completing onboarding', () => {
    expect(isRoleAllowed('manager', ONBOARDING_COMPLETE_ROLES)).toBe(false);
  });

  it('allows manager to manage assignments', () => {
    expect(isRoleAllowed('manager', ASSIGNMENT_MANAGER_ROLES)).toBe(true);
  });

  it('denies waiter from managing assignments', () => {
    expect(isRoleAllowed('waiter', ASSIGNMENT_MANAGER_ROLES)).toBe(false);
  });
});

/**
 * La garde grossiere passe AVANT la permission fine dans
 * `getAuthenticatedUserForTenant`. Une garde plus etroite que la matrice par
 * defaut annule donc la permission en silence - c'est exactement le defaut qui
 * refusait `cashier` et `chef` sur les actions de commande. Ces tests echouent
 * si quelqu'un resserre de nouveau la garde sous la matrice.
 */
describe('garde des actions de commande', () => {
  it("n'exclut aucun role qui detient orders.manage par defaut", () => {
    const detiennent = TOUS_LES_ROLES.filter(
      (role) => DEFAULT_PERMISSIONS[role]?.['orders.manage'] === true,
    );

    // Temoin: si la matrice change, ce test doit etre relu, pas contourne.
    expect(detiennent).toEqual(['owner', 'admin', 'manager', 'cashier', 'chef']);

    for (const role of detiennent) {
      expect(isRoleAllowed(role, ORDER_STAFF_ROLES)).toBe(true);
    }
  });

  it('laisse orders.manage decider seule: les six roles passent la garde', () => {
    expect([...ORDER_STAFF_ROLES].sort()).toEqual([...TOUS_LES_ROLES].sort());
  });

  it('garde les actions qui engagent de l argent au gerant et au-dessus', () => {
    expect([...ORDER_MONEY_ROLES].sort()).toEqual(['admin', 'manager', 'owner']);

    // Restriction VOULUE: cashier et chef detiennent orders.manage mais ne
    // doivent pas pouvoir rembourser ni offrir une note.
    for (const role of ['cashier', 'chef', 'waiter'] as AdminRole[]) {
      expect(isRoleAllowed(role, ORDER_MONEY_ROLES)).toBe(false);
    }
  });

  it('les roles argent sont un sous-ensemble des roles de commande', () => {
    for (const role of ORDER_MONEY_ROLES) {
      expect(isRoleAllowed(role, ORDER_STAFF_ROLES)).toBe(true);
    }
  });
});
