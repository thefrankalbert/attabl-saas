/**
 * Design tokens for TypeScript consumption.
 * Centralizes status colors, chart palette generation, and order status config.
 * All colors reference CSS custom properties or use OKLCH for perceptual uniformity.
 */

// ─── Order Status Configuration ─────────────────────────
// Uses semantic CSS variables instead of arbitrary Tailwind classes.

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'cancelled';

export interface StatusStyle {
  bg: string;
  text: string;
  dot: string;
  pulse: boolean;
}

export const STATUS_STYLES: Record<OrderStatus, StatusStyle> = {
  pending: {
    bg: 'bg-status-warning-bg',
    text: 'text-status-warning',
    dot: 'bg-status-warning',
    pulse: true,
  },
  confirmed: {
    bg: 'bg-status-info-bg',
    text: 'text-status-info',
    dot: 'bg-status-info',
    pulse: false,
  },
  preparing: {
    bg: 'bg-status-warning-bg',
    text: 'text-status-warning',
    dot: 'bg-status-warning',
    pulse: true,
  },
  ready: {
    bg: 'bg-status-success-bg',
    text: 'text-status-success',
    dot: 'bg-status-success',
    pulse: false,
  },
  delivered: {
    bg: 'bg-app-elevated',
    text: 'text-app-text-muted',
    dot: 'bg-app-text-muted',
    pulse: false,
  },
  cancelled: {
    bg: 'bg-status-error-bg',
    text: 'text-status-error',
    dot: 'bg-status-error',
    pulse: false,
  },
};

// ─── Chart Colors (OKLCH equidistant) ───────────────────
// Generates N perceptually uniform colors for charts.
// All at the same lightness and chroma, evenly spaced in hue.

export function generateChartColors(count: number, startHue = 128): string[] {
  return Array.from(
    { length: count },
    (_, i) => `oklch(0.70 0.15 ${(startHue + (i * 360) / count) % 360})`,
  );
}

/** Default 8-color palette for reports/charts */
export const CHART_PALETTE = generateChartColors(8);
