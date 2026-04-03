/**
 * Centralised cache tag constants.
 *
 * Use these instead of raw strings with `revalidateTag()`.
 * This file is safe to import from both server and client code.
 *
 * IMPORTANT: Use tenant-scoped tags to avoid cross-tenant cache contamination.
 * When one tenant saves settings, only THEIR cache should be invalidated.
 */
export const CACHE_TAG_MENUS = 'menus';
export const CACHE_TAG_TENANT_CONFIG = 'tenant-config';
/** Separate tag for domain-to-slug lookups (very stable, rarely changes). */
export const CACHE_TAG_TENANT_DOMAIN = 'tenant-domain';

/** Tenant-scoped cache tag for tenant config. */
export function tenantConfigTag(slugOrId: string): string {
  return `tenant-config:${slugOrId}`;
}

/** Tenant-scoped cache tag for menus. */
export function tenantMenusTag(tenantId: string): string {
  return `menus:${tenantId}`;
}
