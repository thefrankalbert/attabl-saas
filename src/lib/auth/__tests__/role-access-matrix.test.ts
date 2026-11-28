import { describe, it, expect } from 'vitest';

import { canOpenAdminSubPath, permissionForAdminSubPath } from '../admin-route-permissions';
import { getEffectiveLevels } from '@/lib/permissions';
import { POSTE_CODES, type Poste } from '@/types/permission.types';

/**
 * Preuve deterministe de la matrice d'acces aux pages admin, par poste.
 *
 * Le middleware (proxy.ts via isAdminRouteDenied) et les liens de navigation
 * resolvent l'acces avec les deux memes primitives :
 * `permissionForAdminSubPath(path)` puis `meetsRequirement(levels, exigence)`.
 * Ce test fixe l'attendu de CHAQUE route gardee pour CHACUN des 11 postes : une
 * regression de la matrice ou de la carte des routes echoue ici, au lieu
 * d'ouvrir (ou de cacher) une page au mauvais poste en silence.
 */
const canAccess = (postes: Poste[], subPath: string): boolean =>
  canOpenAdminSubPath(subPath, getEffectiveLevels({ postes }));

// Routes ouvertes a tout membre (aucune exigence).
const OPEN_ROUTES = ['', '/menus', '/categories', '/items', '/service', '/qr-codes'];

const MANAGERS: Poste[] = ['owner', 'manager'];
// Postes qui prennent des commandes (orders.take en entier).
const TAKERS: Poste[] = [
  ...MANAGERS,
  'cashier',
  'bartender',
  'reception',
  'waiter',
  'crew',
  'sales',
];
// Postes qui encaissent (orders.pay en entier) : le serveur n'en est pas.
const PAYERS: Poste[] = [...MANAGERS, 'cashier', 'bartender', 'reception', 'crew', 'sales'];
// Postes qui suivent en cuisine ou au bar (kitchen.track) : ni le caissier, ni
// le serveur, ni la reception, ni la vente (cahier des charges, section 5).
const KITCHEN: Poste[] = [...MANAGERS, 'chef', 'bartender', 'cook', 'crew', 'production'];
// Postes qui voient le stock.
const STOCK: Poste[] = [...MANAGERS, 'chef', 'bartender', 'cook', 'crew', 'production'];

// Route gardee -> les postes admis par la matrice par defaut, ecrits a la main.
const GATED: Array<{ path: string; allowed: Poste[] }> = [
  { path: '/users', allowed: MANAGERS }, // team.view
  { path: '/settings', allowed: MANAGERS }, // settings.edit
  { path: '/settings/permissions', allowed: MANAGERS }, // settings.edit (page : proprietaire seul)
  { path: '/settings/tables', allowed: MANAGERS },
  { path: '/subscription', allowed: MANAGERS }, // billing.manage, niveau borne compris
  { path: '/invoices', allowed: MANAGERS },
  { path: '/audit-logs', allowed: MANAGERS }, // audit.view
  { path: '/reports', allowed: MANAGERS }, // reports.money : pas le chef
  { path: '/inventory', allowed: STOCK },
  { path: '/inventory/counts', allowed: STOCK },
  { path: '/stock-history', allowed: STOCK },
  { path: '/stock-losses', allowed: STOCK },
  { path: '/recipes', allowed: STOCK },
  { path: '/suppliers', allowed: STOCK }, // inventory.view OU suppliers.manage
  { path: '/pos', allowed: TAKERS }, // orders.take
  { path: '/kitchen', allowed: KITCHEN }, // kitchen.track
  { path: '/orders/house-accounts', allowed: PAYERS }, // orders.pay : pas le serveur
  { path: '/orders', allowed: [...POSTE_CODES] }, // prendre, suivre ou encaisser : tous
  { path: '/coupons', allowed: MANAGERS }, // orders.discount en entier
  { path: '/ads', allowed: MANAGERS }, // settings.edit (decision G.d)
  { path: '/announcements', allowed: MANAGERS },
  { path: '/supports', allowed: MANAGERS },
  { path: '/suggestions', allowed: [...MANAGERS, 'chef'] }, // menu.edit
];

describe('matrice d acces aux pages admin, par poste', () => {
  it('toute route ouverte est accessible a chacun des 11 postes', () => {
    for (const poste of POSTE_CODES) {
      for (const path of OPEN_ROUTES) {
        expect(permissionForAdminSubPath(path), path).toBeNull();
        expect(canAccess([poste], path), `${poste} -> ${path || '(accueil)'}`).toBe(true);
      }
    }
  });

  describe.each(GATED)('route gardee $path', ({ path, allowed }) => {
    it.each([...POSTE_CODES])('poste %s', (poste) => {
      expect(canAccess([poste], path)).toBe(allowed.includes(poste));
    });
  });

  it('un visiteur sans poste n ouvre aucune route gardee', () => {
    for (const { path } of GATED) expect(canAccess([], path), path).toBe(false);
  });

  it('le chef ne voit ni les rapports d argent, ni les coupons, ni les publicites', () => {
    const reachable = GATED.filter((g) => canAccess(['chef'], g.path)).map((g) => g.path);
    expect(reachable).toEqual([
      '/inventory',
      '/inventory/counts',
      '/stock-history',
      '/stock-losses',
      '/recipes',
      '/suppliers',
      '/kitchen',
      '/orders',
      '/suggestions',
    ]);
  });

  // Cahier des charges, section 5: la cuisine n'est ni au serveur ni au caissier.
  it('le serveur n ouvre que la caisse et les commandes (pas la cuisine)', () => {
    const reachable = GATED.filter((g) => canAccess(['waiter'], g.path)).map((g) => g.path);
    expect(reachable).toEqual(['/pos', '/orders']);
  });

  it('cumul : serveur et caissier ouvre aussi les ardoises, serveur et cuisinier le stock', () => {
    expect(canAccess(['waiter'], '/orders/house-accounts')).toBe(false);
    expect(canAccess(['cashier', 'waiter'], '/orders/house-accounts')).toBe(true);
    expect(canAccess(['waiter'], '/inventory')).toBe(false);
    expect(canAccess(['waiter', 'cook'], '/inventory')).toBe(true);
  });
});

describe('exigences composees des routes', () => {
  it('anyOf : la page fournisseurs s ouvre avec suppliers.manage seul', () => {
    const levels = getEffectiveLevels({
      postes: ['waiter'],
      permission_overrides: { 'suppliers.manage': true },
    });
    expect(canOpenAdminSubPath('/suppliers', levels)).toBe(true);
    expect(canOpenAdminSubPath('/inventory', levels)).toBe(false);
  });

  it('atLeastLimited : le gerant voit l abonnement, et le perd si on lui retire le droit', () => {
    expect(canAccess(['manager'], '/subscription')).toBe(true);
    const removed = getEffectiveLevels({
      postes: ['manager'],
      permission_overrides: { 'billing.manage': false },
    });
    expect(canOpenAdminSubPath('/subscription', removed)).toBe(false);
    expect(canOpenAdminSubPath('/invoices', removed)).toBe(false);
  });

  it('un droit borne n ouvre pas une route qui exige le droit entier', () => {
    // Le caissier a `orders.discount` en niveau borne : pas la page des coupons.
    expect(canAccess(['cashier'], '/coupons')).toBe(false);
    const full = getEffectiveLevels({
      postes: ['cashier'],
      permission_overrides: { 'orders.discount': true },
    });
    expect(canOpenAdminSubPath('/coupons', full)).toBe(true);
  });
});
