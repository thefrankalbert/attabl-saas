import { describe, it, expect } from 'vitest';

import { permissionForAdminSubPath } from '../admin-route-permissions';
import { hasPermission } from '@/lib/permissions';
import type { AdminRole, AdminUser } from '@/types/admin.types';

/**
 * Deterministic proof of the per-role admin access matrix.
 *
 * Both the middleware gate (proxy.ts via isAdminRouteDenied) and the sidebar
 * link filtering (ShellSidebar via navPermissions) resolve access with the same
 * two primitives: `permissionForAdminSubPath(path)` + `hasPermission(role, perm)`.
 * This test pins the EXPECTED allow/deny for every gated route x every role, so a
 * regression in DEFAULT_PERMISSIONS or the route map fails loudly instead of
 * silently opening (or hiding) a page for the wrong role.
 */

// Resolve access exactly like the middleware + sidebar do (default matrix, no overrides).
function canAccess(role: AdminRole, subPath: string): boolean {
  const required = permissionForAdminSubPath(subPath);
  if (required == null) return true; // open route - every member
  const principal = { role, custom_permissions: null } as AdminUser;
  return hasPermission(principal, required);
}

const ROLES: AdminRole[] = ['owner', 'admin', 'manager', 'cashier', 'chef', 'waiter'];

// Open routes: reachable by ALL roles (permissionForAdminSubPath returns null).
const OPEN_ROUTES = ['', '/orders', '/kitchen', '/menus', '/categories', '/items', '/service'];

// Gated routes -> the exact set of roles allowed by the default matrix.
const GATED: Array<{ path: string; allowed: AdminRole[] }> = [
  { path: '/users', allowed: ['owner', 'admin', 'manager'] }, // team.view
  { path: '/settings', allowed: ['owner', 'admin'] }, // settings.view
  { path: '/settings/permissions', allowed: ['owner', 'admin'] }, // settings.edit
  { path: '/subscription', allowed: ['owner', 'admin'] }, // settings.view
  { path: '/audit-logs', allowed: ['owner', 'admin'] }, // settings.view
  { path: '/invoices', allowed: ['owner', 'admin'] }, // settings.view
  { path: '/reports', allowed: ['owner', 'admin', 'manager'] }, // reports.view
  { path: '/inventory', allowed: ['owner', 'admin', 'manager', 'chef'] }, // inventory.view
  { path: '/stock-history', allowed: ['owner', 'admin', 'manager', 'chef'] },
  { path: '/suppliers', allowed: ['owner', 'admin', 'manager', 'chef'] },
  { path: '/recipes', allowed: ['owner', 'admin', 'manager', 'chef'] },
  // Le serveur prend les commandes a la caisse (decision du 2026-11-09).
  { path: '/pos', allowed: ['owner', 'admin', 'manager', 'cashier', 'waiter'] }, // pos.use
  // Les ardoises sont de l'argent: ni le serveur ni le chef.
  { path: '/orders/house-accounts', allowed: ['owner', 'admin', 'manager', 'cashier'] }, // orders.pay
  { path: '/coupons', allowed: ['owner', 'admin', 'manager'] }, // menu.edit
  { path: '/ads', allowed: ['owner', 'admin', 'manager'] },
  { path: '/announcements', allowed: ['owner', 'admin', 'manager'] },
  { path: '/suggestions', allowed: ['owner', 'admin', 'manager'] },
  { path: '/supports', allowed: ['owner', 'admin', 'manager'] },
];

describe('admin per-role access matrix', () => {
  it('lets every role reach the open operational routes', () => {
    for (const role of ROLES) {
      for (const path of OPEN_ROUTES) {
        expect(canAccess(role, path), `${role} should reach ${path || '(home)'}`).toBe(true);
      }
    }
  });

  describe.each(GATED)('gated route $path', ({ path, allowed }) => {
    it.each(ROLES)('role %s', (role) => {
      expect(canAccess(role, path)).toBe(allowed.includes(role));
    });
  });

  it('owner and admin can reach every gated route', () => {
    for (const path of GATED.map((g) => g.path)) {
      expect(canAccess('owner', path)).toBe(true);
      expect(canAccess('admin', path)).toBe(true);
    }
  });

  it('waiter reaches only POS among gated routes (takes orders, no money)', () => {
    const reachable = GATED.filter((g) => canAccess('waiter', g.path)).map((g) => g.path);
    expect(reachable).toEqual(['/pos']);
  });

  it('cashier reaches only POS and the house accounts among gated routes', () => {
    const reachable = GATED.filter((g) => canAccess('cashier', g.path)).map((g) => g.path);
    expect(reachable).toEqual(['/pos', '/orders/house-accounts']);
  });

  it('chef reaches only the inventory routes among gated routes', () => {
    const reachable = GATED.filter((g) => canAccess('chef', g.path)).map((g) => g.path);
    expect(reachable).toEqual(['/inventory', '/stock-history', '/suppliers', '/recipes']);
  });
});
