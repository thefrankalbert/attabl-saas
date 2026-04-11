/**
 * WCAG 2.1 contrast validation utilities.
 *
 * Pure TypeScript helpers used to validate tenant brand colors before
 * they are persisted. Follows the WCAG 2.1 spec for relative luminance
 * and contrast ratio calculations.
 *
 * References:
 * - https://www.w3.org/WAI/GL/wiki/Relative_luminance
 * - https://www.w3.org/TR/WCAG21/#contrast-minimum
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface BrandValidationResult {
  valid: boolean;
  ratio: number;
  reason?: string;
  grandfathered?: boolean;
}

export interface ValidateBrandPrimaryOptions {
  /**
   * If true, use the WCAG AA large-text threshold (3:1) instead of the
   * normal-text threshold (4.5:1). Use for colors that will only be
   * rendered behind >= 18pt or >= 14pt bold text.
   */
  isLargeText?: boolean;
  /**
   * If false, disable the grandfathered brand colors bypass. Default true.
   */
  allowGrandfathered?: boolean;
}

/**
 * Pre-WCAG-validator brand colors accepted for legacy compatibility.
 * These colors do not meet the 4.5:1 threshold against white but are
 * used by major food-ordering platforms (UberEats ships #06C167 as its
 * brand green) and predate this validator. Keep entries UPPERCASE.
 */
export const GRANDFATHERED_BRAND_COLORS: readonly string[] = ['#06C167'];

const HEX_REGEX = /^#([0-9a-fA-F]{6})$/;

/**
 * Convert a hex color (#RRGGBB) to RGB.
 * Returns null if the hex is invalid.
 */
export function hexToRgb(hex: string): Rgb | null {
  if (typeof hex !== 'string') return null;
  const match = HEX_REGEX.exec(hex.trim());
  if (!match) return null;
  const intVal = parseInt(match[1], 16);
  return {
    r: (intVal >> 16) & 0xff,
    g: (intVal >> 8) & 0xff,
    b: intVal & 0xff,
  };
}

/**
 * Convert an RGB triplet back to a 6-digit hex color (#RRGGBB, uppercase).
 */
function rgbToHex(rgb: Rgb): string {
  const toHex = (n: number): string => {
    const clamped = Math.max(0, Math.min(255, Math.round(n)));
    return clamped.toString(16).padStart(2, '0');
  };
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toUpperCase();
}

/**
 * Convert an sRGB channel (0-255) to a linearized value.
 * Follows WCAG 2.1 relative luminance formula.
 */
function channelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Calculate the relative luminance of a color (WCAG 2.1 formula).
 * https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
export function relativeLuminance(rgb: Rgb): number {
  const r = channelToLinear(rgb.r);
  const g = channelToLinear(rgb.g);
  const b = channelToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate contrast ratio between two colors (WCAG 2.1 formula).
 * Returns a value between 1 and 21. Returns 1 if either hex is invalid.
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return 1;
  const l1 = relativeLuminance(rgb1);
  const l2 = relativeLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if a foreground/background color pair meets WCAG AA.
 * AA requires contrast >= 4.5:1 for normal text,
 * and >= 3:1 for large text (>= 18pt or 14pt bold).
 */
export function meetsWCAG_AA(foreground: string, background: string, isLargeText = false): boolean {
  const ratio = contrastRatio(foreground, background);
  const threshold = isLargeText ? 3 : 4.5;
  return ratio >= threshold;
}

/**
 * Check if a color is suitable as a PRIMARY brand color for CTAs.
 * Must have >= 4.5:1 contrast against WHITE (CTAs render white text
 * on the primary background).
 *
 * Accepts an optional options object:
 * - `isLargeText`: use the 3:1 large-text threshold instead of 4.5:1.
 * - `allowGrandfathered`: when true (default), colors listed in
 *   GRANDFATHERED_BRAND_COLORS are accepted regardless of ratio.
 */
export function validateBrandPrimary(
  hex: string,
  options?: ValidateBrandPrimaryOptions,
): BrandValidationResult {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return {
      valid: false,
      ratio: 0,
      reason: 'Invalid hex color format. Use #RRGGBB.',
    };
  }
  const ratio = contrastRatio(hex, '#FFFFFF');
  const allowGrandfathered = options?.allowGrandfathered !== false;
  if (allowGrandfathered && GRANDFATHERED_BRAND_COLORS.includes(hex.toUpperCase())) {
    return { valid: true, ratio, grandfathered: true };
  }
  const threshold = options?.isLargeText ? 3 : 4.5;
  if (ratio < threshold) {
    return {
      valid: false,
      ratio,
      reason: `Contrast ratio ${ratio.toFixed(2)}:1 against white is below WCAG AA minimum of ${threshold}:1.`,
    };
  }
  return { valid: true, ratio };
}

/**
 * Convert an RGB triplet to HSL. H in [0, 360), S and L in [0, 1].
 */
function rgbToHsl(rgb: Rgb): { h: number; s: number; l: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / d + 2) * 60;
        break;
      case b:
        h = ((r - g) / d + 4) * 60;
        break;
    }
  }
  return { h, s, l };
}

/**
 * Convert an HSL triplet back to RGB. H in [0, 360), S and L in [0, 1].
 */
function hslToRgb(h: number, s: number, l: number): Rgb {
  const hueToRgb = (p: number, q: number, t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hNorm = h / 360;
  return {
    r: Math.round(hueToRgb(p, q, hNorm + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, hNorm) * 255),
    b: Math.round(hueToRgb(p, q, hNorm - 1 / 3) * 255),
  };
}

/**
 * Suggest the closest WCAG-compliant shade of a given hex color.
 * If the input is too light, darken it by decreasing HSL lightness in
 * 5% steps until it meets AA against white.
 * Returns the adjusted hex or null if no adjustment achieves compliance.
 */
export function suggestCompliantShade(hex: string): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  // If already compliant by the raw contrast rule (NOT grandfathered),
  // return as-is (normalized to uppercase). Grandfathered colors must
  // still be darkened so the suggestion is a true 4.5:1 pass.
  if (validateBrandPrimary(hex, { allowGrandfathered: false }).valid) {
    return rgbToHex(rgb);
  }

  const { h, s, l } = rgbToHsl(rgb);
  let lightness = l;
  // Decrease lightness by 5% steps. Upper bound on iterations to avoid
  // infinite loops with degenerate inputs.
  for (let i = 0; i < 20; i++) {
    lightness = Math.max(0, lightness - 0.05);
    const nextRgb = hslToRgb(h, s, lightness);
    const nextHex = rgbToHex(nextRgb);
    if (validateBrandPrimary(nextHex, { allowGrandfathered: false }).valid) {
      return nextHex;
    }
    if (lightness === 0) break;
  }
  return null;
}
