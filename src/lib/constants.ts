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
export const ORDER_STATUS = {
    pending: {
        label: 'En attente',
        labelEn: 'Pending',
        color: 'amber',
        bgClass: 'bg-amber-100/50',
        textClass: 'text-amber-700',
        dotClass: 'bg-amber-500',
    },
    preparing: {
        label: 'En préparation',
        labelEn: 'Preparing',
        color: 'blue',
        bgClass: 'bg-blue-100/50',
        textClass: 'text-blue-700',
        dotClass: 'bg-blue-500',
    },
    ready: {
        label: 'Prêt',
        labelEn: 'Ready',
        color: 'emerald',
        bgClass: 'bg-emerald-100/50',
        textClass: 'text-emerald-700',
        dotClass: 'bg-emerald-500',
    },
    delivered: {
        label: 'Servi',
        labelEn: 'Delivered',
        color: 'gray',
        bgClass: 'bg-gray-100/50',
        textClass: 'text-gray-600',
        dotClass: 'bg-gray-400',
    },
    cancelled: {
        label: 'Annulé',
        labelEn: 'Cancelled',
        color: 'red',
        bgClass: 'bg-red-100/50',
        textClass: 'text-red-600',
        dotClass: 'bg-red-500',
    },
} as const;

// Default Currency (overridable per tenant via settings)
export const DEFAULT_CURRENCY = {
    code: 'XAF',
    symbol: 'FCFA',
    locale: 'fr-FR',
} as const;

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

// Supported Languages
export const LANGUAGES = {
    fr: { label: 'Français', flag: '🇫🇷' },
    en: { label: 'English', flag: '🇬🇧' },
} as const;

// Admin Navigation Groups (used by AdminSidebar)
export const ADMIN_NAV_GROUPS = [
    {
        title: 'Principal',
        titleEn: 'Main',
        items: ['dashboard', 'orders'],
    },
    {
        title: 'Organisation',
        titleEn: 'Organization',
        items: ['categories', 'items', 'announcements'],
    },
    {
        title: 'Outils',
        titleEn: 'Tools',
        items: ['pos', 'kitchen', 'qrcodes', 'reports'],
    },
    {
        title: 'Administration',
        titleEn: 'Administration',
        items: ['users', 'settings', 'subscription'],
    },
] as const;
