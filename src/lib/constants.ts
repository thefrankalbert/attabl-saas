/**
 * ATTABL SaaS Design System Constants
 * Centralized design tokens for consistent styling across tenants
 */

// Status Colors (shared across all tenants)
export const COLORS = {
  status: {
    success: '#22C55E',
    warning: '#EAB308',
    error: '#EF4444',
    info: '#3B82F6',
  },
  text: {
    primary: '#111827',
    secondary: '#6B7280',
    muted: '#9CA3AF',
    inverse: '#FFFFFF',
  },
  dark: {
    background: '#000000',
    surface: '#18181B',
    border: '#27272A',
    text: '#FAFAFA',
    textMuted: '#71717A',
  },
} as const;

// Z-Index Scale
export const Z_INDEX = {
  dropdown: 50,
  sticky: 100,
  modal: 200,
  toast: 300,
} as const;

// Animation Durations (ms)
export const ANIMATION = {
  fast: 150,
  normal: 300,
  slow: 500,
} as const;

// Order Status Configuration
// Labels come from next-intl: orders.pending, orders.preparing, etc.
export const ORDER_STATUS = {
  pending: {
    key: 'pending' as const,
    color: 'amber',
    bgClass: 'bg-amber-100/50',
    textClass: 'text-amber-700',
    dotClass: 'bg-amber-500',
  },
  preparing: {
    key: 'preparing' as const,
    color: 'blue',
    bgClass: 'bg-blue-100/50',
    textClass: 'text-blue-700',
    dotClass: 'bg-blue-500',
  },
  ready: {
    key: 'ready' as const,
    color: 'emerald',
    bgClass: 'bg-emerald-100/50',
    textClass: 'text-emerald-700',
    dotClass: 'bg-emerald-500',
  },
  delivered: {
    key: 'delivered' as const,
    color: 'gray',
    bgClass: 'bg-gray-100/50',
    textClass: 'text-gray-600',
    dotClass: 'bg-gray-400',
  },
  cancelled: {
    key: 'cancelled' as const,
    color: 'red',
    bgClass: 'bg-red-100/50',
    textClass: 'text-red-600',
    dotClass: 'bg-red-500',
  },
} as const;

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

// Legacy compat
export const DEFAULT_CURRENCY = CURRENCIES.XAF;

// ─── Tenant URL Helper ──────────────────────────────────────
/**
 * Builds the public-facing URL for a tenant's client space.
 *
 * In production: https://{slug}.attabl.com
 * In development: http://{slug}.localhost:3000
 *
 * The middleware rewrites subdomain requests to /sites/{slug}/… internally,
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

  // In dev: http://slug.localhost:3000 — in prod: https://slug.attabl.com
  return `${protocol}://${slug}.${appDomain}`;
}

// App Configuration
export const APP_CONFIG = {
  name: 'ATTABL',
  maxTableNumberLength: 10,
  orderHistoryKey: 'order_history',
  cartKey: 'cart',
  cartTenantKey: 'cart_tenant_id',
  lastMenuKey: 'attabl_last_menu',
  defaultPageSize: 20,
  maxFileUploadSize: 5 * 1024 * 1024, // 5MB
} as const;

// Admin Layout — shared navigation helpers
/** Pages that hide top-bar, bottom-nav, and chrome (POS, KDS) */
export const IMMERSIVE_SEGMENTS = ['/kitchen', '/pos'] as const;

/** Check if a pathname is an immersive admin page */
export function isImmersivePage(pathname: string | null): boolean {
  return IMMERSIVE_SEGMENTS.some((seg) => pathname?.includes(`/admin${seg}`));
}

/** Check if a pathname is the admin home page */
export function isAdminHome(pathname: string | null, basePath: string): boolean {
  return pathname === basePath || pathname === `${basePath}/`;
}

// Admin Navigation Groups
// Group titles come from next-intl: sidebar.groupMain, sidebar.groupOrganization, etc.
export const ADMIN_NAV_GROUPS = [
  {
    titleKey: 'groupMain' as const,
    items: ['dashboard', 'orders'],
  },
  {
    titleKey: 'groupOrganization' as const,
    items: ['categories', 'items', 'announcements'],
  },
  {
    titleKey: 'groupTools' as const,
    items: ['pos', 'kitchen', 'qrcodes', 'reports'],
  },
  {
    titleKey: 'groupAdmin' as const,
    items: ['users', 'settings', 'subscription'],
  },
] as const;
