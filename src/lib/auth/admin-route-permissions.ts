import { BILLING_READ, ORDERS_VIEW } from '@/lib/admin-roles';
import {
  meetsRequirement,
  type PermissionLevels,
  type PermissionRequirement,
} from '@/lib/permissions';

/**
 * Maps an admin sub-route (the path AFTER `/admin`, e.g. `/users`,
 * `/settings/permissions`, or `` for the dashboard home) to the permission
 * required to view it. First match wins, so more specific routes are listed
 * before their parent (e.g. /settings/permissions before /settings).
 *
 * Routes that return null are open to any authenticated tenant member -
 * operational pages every role needs: dashboard home, menus,
 * items, categories, service, qr-codes, support. Their EDIT actions are hidden
 * on screen without the matching permission (menu.edit, orders.pay...).
 *
 * Enforced in the middleware (proxy.ts) so an unauthorized role gets a clean
 * server-side 307 redirect for ALL clients (browser, curl, bots), and mirrored
 * by the per-page `requireAdminPermission` guards as defense in depth.
 */
const ROUTE_PERMISSIONS: ReadonlyArray<{ test: RegExp; permission: PermissionRequirement }> = [
  { test: /^\/users(\/|$)/, permission: 'team.view' },
  // La page des droits garde en plus son controle "proprietaire seulement".
  { test: /^\/settings\/permissions(\/|$)/, permission: 'settings.edit' },
  { test: /^\/settings(\/|$)/, permission: 'settings.edit' },
  // Abonnement et factures: le gerant les VOIT (niveau borne), il ne paie pas.
  { test: /^\/subscription(\/|$)/, permission: BILLING_READ },
  { test: /^\/invoices(\/|$)/, permission: BILLING_READ },
  { test: /^\/audit-logs(\/|$)/, permission: 'audit.view' },
  { test: /^\/reports(\/|$)/, permission: 'reports.money' },
  { test: /^\/inventory\/counts(\/|$)/, permission: 'inventory.view' },
  { test: /^\/inventory(\/|$)/, permission: 'inventory.view' },
  { test: /^\/stock-history(\/|$)/, permission: 'inventory.view' },
  { test: /^\/stock-losses(\/|$)/, permission: 'inventory.view' },
  { test: /^\/suppliers(\/|$)/, permission: { anyOf: ['inventory.view', 'suppliers.manage'] } },
  { test: /^\/recipes(\/|$)/, permission: 'inventory.view' },
  { test: /^\/pos(\/|$)/, permission: 'orders.take' },
  // "Suivre en cuisine ou au bar" (cahier des charges, section 5): ni le
  // caissier ni le serveur n'ouvrent l'ecran de cuisine.
  { test: /^\/kitchen(\/|$)/, permission: 'kitchen.track' },
  // Les ardoises sont de l'argent (decision du 2026-11-09): pas le serveur ni le chef.
  { test: /^\/orders\/house-accounts(\/|$)/, permission: 'orders.pay' },
  { test: /^\/orders(\/|$)/, permission: ORDERS_VIEW },
  // Un code promo est une remise.
  { test: /^\/coupons(\/|$)/, permission: 'orders.discount' },
  // Publicites, annonces, supports: reglages du restaurant (decision G.d), pour
  // que le chef ne les obtienne pas avec "Modifier la carte".
  { test: /^\/ads(\/|$)/, permission: 'settings.edit' },
  { test: /^\/announcements(\/|$)/, permission: 'settings.edit' },
  { test: /^\/suggestions(\/|$)/, permission: 'menu.edit' },
  { test: /^\/supports(\/|$)/, permission: 'settings.edit' },
];

/**
 * Returns the permission required for an admin sub-route, or null if the route
 * is open to all tenant members. `subPath` is the path after `/admin`
 * (e.g. `/users`, `/settings/permissions`, or `` for the dashboard home).
 */
export function permissionForAdminSubPath(subPath: string): PermissionRequirement | null {
  for (const { test, permission } of ROUTE_PERMISSIONS) {
    if (test.test(subPath)) return permission;
  }
  return null;
}

/**
 * Le membre peut-il ouvrir cette sous-route admin, d'apres ses droits
 * EFFECTIFS ? Meme regle que le middleware: une route sans droit exige est
 * ouverte a tout membre. Partage par la barre du bas et la palette de commandes
 * pour qu'aucun lien ne mene a /unauthorized.
 */
export function canOpenAdminSubPath(subPath: string, levels: PermissionLevels): boolean {
  const required = permissionForAdminSubPath(subPath);
  return required === null || meetsRequirement(levels, required);
}
