import { describe, expect, it } from 'vitest';
import {
  ASSIGNMENT_MANAGER_ROLES,
  isRoleAllowed,
  ONBOARDING_COMPLETE_ROLES,
  ORDER_MONEY_ROLES,
  ALL_ADMIN_ROLES,
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
    // Le serveur fait avancer les commandes (decision du 2026-11-09).
    expect(detiennent).toEqual(['owner', 'admin', 'manager', 'cashier', 'chef', 'waiter']);

    for (const role of detiennent) {
      expect(isRoleAllowed(role, ALL_ADMIN_ROLES)).toBe(true);
    }
  });

  it('laisse orders.manage decider seule: les six roles passent la garde', () => {
    expect([...ALL_ADMIN_ROLES].sort()).toEqual([...TOUS_LES_ROLES].sort());
  });

  it('garde les actions qui engagent de l argent au gerant et au-dessus', () => {
    expect([...ORDER_MONEY_ROLES].sort()).toEqual(['admin', 'manager', 'owner']);

    // Restriction VOULUE: cashier, chef et waiter detiennent orders.manage mais
    // ne doivent pas pouvoir rembourser ni offrir une note.
    for (const role of ['cashier', 'chef', 'waiter'] as AdminRole[]) {
      expect(isRoleAllowed(role, ORDER_MONEY_ROLES)).toBe(false);
    }
  });

  it('les roles argent sont un sous-ensemble des roles de commande', () => {
    for (const role of ORDER_MONEY_ROLES) {
      expect(isRoleAllowed(role, ALL_ADMIN_ROLES)).toBe(true);
    }
  });
});

/**
 * Decision du proprietaire (2026-11-09): le chef et le serveur ne touchent pas
 * a l'argent. Le caissier encaisse. Le serveur prend les commandes en caisse.
 */
describe('matrice par defaut: argent et caisse', () => {
  it("n'accorde orders.pay qu'aux roles qui encaissent", () => {
    const encaissent = TOUS_LES_ROLES.filter(
      (role) => DEFAULT_PERMISSIONS[role]?.['orders.pay'] === true,
    );
    expect(encaissent).toEqual(['owner', 'admin', 'manager', 'cashier']);
  });

  it('donne la caisse au serveur sans lui donner l argent', () => {
    expect(DEFAULT_PERMISSIONS.waiter['pos.use']).toBe(true);
    expect(DEFAULT_PERMISSIONS.waiter['orders.manage']).toBe(true);
    expect(DEFAULT_PERMISSIONS.waiter['orders.pay']).toBe(false);
    expect(DEFAULT_PERMISSIONS.chef['orders.pay']).toBe(false);
  });
});
