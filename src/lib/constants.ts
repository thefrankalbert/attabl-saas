/**
 * ATTABL SaaS Design System Constants
 * Centralized design tokens for consistent styling across tenants
 */

// ─── Multi-Currency Configuration ────────────────────────────
export const CURRENCIES = {
  XAF: {
    code: 'XAF' as const,
    symbol: 'FCFA',
    name: 'Franc CFA',
    locale: 'fr-FR',
    decimals: 0,
    position: 'after' as const,
  },
  EUR: {
    code: 'EUR' as const,
    symbol: '€',
    name: 'Euro',
    locale: 'fr-FR',
    decimals: 2,
    position: 'after' as const,
  },
  USD: {
    code: 'USD' as const,
    symbol: '$',
    name: 'US Dollar',
    locale: 'en-US',
    decimals: 2,
    position: 'before' as const,
  },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;
export const DEFAULT_CURRENCY_CODE: CurrencyCode = 'XAF';

// ─── Tenant URL Helper ──────────────────────────────────────
/**
 * Builds the public-facing URL for a tenant's client space.
 *
 * In production: https://{slug}.attabl.com
 * In development: http://{slug}.localhost:3000
 *
 * The middleware rewrites subdomain requests to /sites/{slug}/... internally,
 * but customers should always see the subdomain URL.
 *
 * Works on both server (reads process.env) and client (reads NEXT_PUBLIC_ vars).
 */
export function getTenantUrl(slug: string): string {
  const appDomain =
    process.env.NEXT_PUBLIC_APP_DOMAIN ||
    (typeof window !== 'undefined' ? 'attabl.com' : 'attabl.com');
  const isLocalDev = appDomain === 'localhost' || appDomain.startsWith('localhost:');
  const protocol = isLocalDev ? 'http' : 'https';

  // In dev: http://slug.localhost:3000 - in prod: https://slug.attabl.com
  return `${protocol}://${slug}.${appDomain}`;
}

// Admin Layout - shared navigation helpers
/** Pages that hide top-bar, bottom-nav, and chrome (POS, KDS) */
const IMMERSIVE_SEGMENTS = ['/kitchen', '/pos'] as const;

/** Check if a pathname is an immersive admin page */
export function isImmersivePage(pathname: string | null): boolean {
  return IMMERSIVE_SEGMENTS.some((seg) => pathname?.includes(`/admin${seg}`));
}

/** Check if a pathname is the admin home page */
export function isAdminHome(pathname: string | null, basePath: string): boolean {
  return pathname === basePath || pathname === `${basePath}/`;
}
