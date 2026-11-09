import type { CSSProperties } from 'react';

import { contrastRatio, hexToRgb } from '@/lib/utils/wcag';

/** ATTABL brand lime: the storefront CTA color of a tenant with no color of its own. */
export const STOREFRONT_DEFAULT_PRIMARY = '#CCFF00';

const WHITE = '#FFFFFF';
// Black, not the #1A1A1A ink: between white and black, the better one always
// reaches 4.5:1 (worst case about 4.58:1); with #1A1A1A some presets fall to 4.4.
const BLACK = '#000000';

/** The tenant primary color when it is a valid #RRGGBB, else the ATTABL lime. */
export function resolveStorefrontPrimary(primaryColor: string | null | undefined): string {
  const hex = primaryColor?.trim() ?? '';
  return hexToRgb(hex) ? hex : STOREFRONT_DEFAULT_PRIMARY;
}

/**
 * Storefront CTA tokens for one tenant: `--brand-cta` (background) and
 * `--brand-cta-fg` (text on it).
 *
 * The CTAs ("Commander", "Plat du jour") were painted with the fixed green
 * `--color-brand`, so a Ruby restaurant got green buttons. Only these
 * dedicated tokens follow the tenant: `--color-brand` keeps its meaning for
 * status indicators (veg tag, order tracker, discount...).
 *
 * The text color is the more readable of white and black on that background:
 * white on lime (#CCFF00) measures 1.18:1 and would be unreadable.
 */
export function storefrontBrandStyle(primaryColor: string | null | undefined): CSSProperties {
  const bg = resolveStorefrontPrimary(primaryColor);
  const fg = contrastRatio(bg, WHITE) >= contrastRatio(bg, BLACK) ? WHITE : BLACK;
  return { '--brand-cta': bg, '--brand-cta-fg': fg } as CSSProperties;
}
