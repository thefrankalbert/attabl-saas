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

// Admin Navigation Groups (used by AdminSidebar)
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
