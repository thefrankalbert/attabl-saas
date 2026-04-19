/**
 * Curated Fonts System - ATTABL tenant client interface
 *
 * Per 2025/2026 market research (Toast, Square, Lightspeed pattern), tenants
 * choose from a locked curated list of Google Fonts. No free uploads, no
 * arbitrary values - this guarantees performance, brand consistency, and
 * legal compliance for the tenant client menus.
 *
 * Each font is loaded once in the root layout via next/font/google, and the
 * tenant layout selects the corresponding CSS variable at render time.
 */

export type FontCategory = 'sans' | 'serif' | 'display';

export interface CuratedFont {
  /** Stable DB identifier stored in tenants.font_family. */
  id: string;
  /** Human-readable label shown in the tenant settings UI. */
  name: string;
  /** CSS variable name exposed by next/font/google in the root layout. */
  cssVariable: string;
  /** Exact Google Fonts family name (for documentation/fallback purposes). */
  googleFontName: string;
  /** Broad classification used for grouping/filtering in the picker. */
  category: FontCategory;
}

/**
 * Curated list of 10 Google Fonts available to tenants.
 * Inter is the default (UberEats-like). Order matters for the picker UI.
 */
export const CURATED_FONTS: readonly CuratedFont[] = [
  {
    id: 'inter',
    name: 'Inter',
    cssVariable: '--font-inter',
    googleFontName: 'Inter',
    category: 'sans',
  },
  {
    id: 'poppins',
    name: 'Poppins',
    cssVariable: '--font-poppins',
    googleFontName: 'Poppins',
    category: 'sans',
  },
  {
    id: 'montserrat',
    name: 'Montserrat',
    cssVariable: '--font-montserrat',
    googleFontName: 'Montserrat',
    category: 'sans',
  },
  {
    id: 'playfair-display',
    name: 'Playfair Display',
    cssVariable: '--font-playfair-display',
    googleFontName: 'Playfair Display',
    category: 'serif',
  },
  {
    id: 'raleway',
    name: 'Raleway',
    cssVariable: '--font-raleway',
    googleFontName: 'Raleway',
    category: 'sans',
  },
  {
    id: 'nunito',
    name: 'Nunito',
    cssVariable: '--font-nunito',
    googleFontName: 'Nunito',
    category: 'sans',
  },
  {
    id: 'roboto',
    name: 'Roboto',
    cssVariable: '--font-roboto',
    googleFontName: 'Roboto',
    category: 'sans',
  },
  {
    id: 'lato',
    name: 'Lato',
    cssVariable: '--font-lato',
    googleFontName: 'Lato',
    category: 'sans',
  },
  {
    id: 'open-sans',
    name: 'Open Sans',
    cssVariable: '--font-open-sans',
    googleFontName: 'Open Sans',
    category: 'sans',
  },
  {
    id: 'source-sans-3',
    name: 'Source Sans 3',
    cssVariable: '--font-source-sans-3',
    googleFontName: 'Source Sans 3',
    category: 'sans',
  },
] as const;

/** Union type of all valid curated font ids. */
export type TenantFontId = (typeof CURATED_FONTS)[number]['id'];

/** Default font applied when a tenant has no font_family or an invalid one. */
export const DEFAULT_FONT: CuratedFont = CURATED_FONTS[0];

/**
 * Resolve a font id (typically from tenants.font_family) to a curated font.
 * Falls back to Inter if the id is null, undefined, empty, or not in the list.
 */
export function getFontById(id: string | null | undefined): CuratedFont {
  if (!id) {
    return DEFAULT_FONT;
  }
  const normalized = id.trim().toLowerCase();
  const match = CURATED_FONTS.find((font) => font.id === normalized);
  return match ?? DEFAULT_FONT;
}
