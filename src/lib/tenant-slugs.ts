/**
 * Slugs that must never be used as tenant identifiers in /sites/[site]/...
 */
const RESERVED_SITE_SLUGS = new Set([
  'admin',
  'api',
  'login',
  'signup',
  'onboarding',
  'checkout',
  'auth',
  'unauthorized',
]);

export function isReservedSiteSlug(slug: string): boolean {
  return RESERVED_SITE_SLUGS.has(slug.toLowerCase());
}
