import type { PermissionCode } from '@/types/permission.types';

/**
 * Maps an admin sub-route (the path AFTER `/admin`, e.g. `/users`,
 * `/settings/permissions`, or `` for the dashboard home) to the permission
 * required to view it. First match wins, so more specific routes are listed
 * before their parent (e.g. /settings/permissions before /settings).
 *
 * Routes that return null are open to any authenticated tenant member -
 * operational pages every role needs: dashboard home, orders, kitchen, menus,
 * items, categories, service, qr-codes, support.
 *
 * Enforced in the middleware (proxy.ts) so an unauthorized role gets a clean
 * server-side 307 redirect for ALL clients (browser, curl, bots), and mirrored
 * by the per-page `requireAdminPermission` guards as defense in depth.
 */
const ROUTE_PERMISSIONS: ReadonlyArray<{ test: RegExp; permission: PermissionCode }> = [
  { test: /^\/users(\/|$)/, permission: 'team.view' },
  { test: /^\/settings\/permissions(\/|$)/, permission: 'settings.edit' },
  { test: /^\/settings(\/|$)/, permission: 'settings.view' },
  { test: /^\/subscription(\/|$)/, permission: 'settings.view' },
  { test: /^\/audit-logs(\/|$)/, permission: 'settings.view' },
  { test: /^\/invoices(\/|$)/, permission: 'settings.view' },
  { test: /^\/reports(\/|$)/, permission: 'reports.view' },
  { test: /^\/inventory\/counts(\/|$)/, permission: 'inventory.view' },
  { test: /^\/inventory(\/|$)/, permission: 'inventory.view' },
  { test: /^\/stock-history(\/|$)/, permission: 'inventory.view' },
  { test: /^\/suppliers(\/|$)/, permission: 'inventory.view' },
  { test: /^\/recipes(\/|$)/, permission: 'inventory.view' },
  { test: /^\/pos(\/|$)/, permission: 'pos.use' },
  { test: /^\/coupons(\/|$)/, permission: 'menu.edit' },
  { test: /^\/ads(\/|$)/, permission: 'menu.edit' },
  { test: /^\/announcements(\/|$)/, permission: 'menu.edit' },
  { test: /^\/suggestions(\/|$)/, permission: 'menu.edit' },
  { test: /^\/supports(\/|$)/, permission: 'menu.edit' },
];

/**
 * Returns the permission required for an admin sub-route, or null if the route
 * is open to all tenant members. `subPath` is the path after `/admin`
 * (e.g. `/users`, `/settings/permissions`, or `` for the dashboard home).
 */
export function permissionForAdminSubPath(subPath: string): PermissionCode | null {
  for (const { test, permission } of ROUTE_PERMISSIONS) {
    if (test.test(subPath)) return permission;
  }
  return null;
}
