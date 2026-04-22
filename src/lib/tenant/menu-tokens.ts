/**
 * Design tokens for the tenant menu page family.
 * Shared across ClientMenuPage and its sub-components in components/tenant/menu.
 * Values mirror DESIGN.md.
 */
export const MENU_COLORS = {
  primary: '#1A1A1A',
  primaryDark: '#000000',
  primaryLight: '#F6F6F6',
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F6F6F6',
  divider: '#EEEEEE',
  textPrimary: '#1A1A1A',
  textSecondary: '#737373',
  textMuted: '#B0B0B0',
  textOnPrimary: '#FFFFFF',
  rating: '#FFB800',
  promo: '#FF3008',
  cartBg: '#1A1A1A',
} as const;

export const tr = (lang: string, fr: string, en?: string | null): string =>
  lang === 'en' && en ? en : fr;

export function triggerAddFeedback(): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(10);
    } catch {
      // Silent: vibration not supported or blocked
    }
  }
}
