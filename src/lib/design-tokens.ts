/**
 * Design tokens for TypeScript consumption.
 * Centralizes status colors, chart palette generation, and order status config.
 * All colors reference CSS custom properties or use OKLCH for perceptual uniformity.
 */

// ─── Order Status Configuration ─────────────────────────
// Uses semantic CSS variables instead of arbitrary Tailwind classes.

// Single source of truth for the order status set: the canonical OrderStatus
// from admin.types (audit H3). design-tokens previously declared its own
// divergent copy (it had a 'confirmed' the app never produces), so the styles
// and the type could drift. Re-exported here so existing importers keep working.
// The DB CHECK still permits a wider legacy set ('confirmed','served'); the app
// never writes those, and getStatusStyle() falls back to a neutral style if one
// ever appears out-of-band. Making 'served' a real app state is Phase 3.
export type { OrderStatus } from '@/types/admin.types';
import type { OrderStatus } from '@/types/admin.types';

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
  preparing: {
    bg: 'bg-status-info-bg',
    text: 'text-status-info',
    dot: 'bg-status-info',
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

/**
 * Style for an order status, with a safe neutral fallback for any value outside
 * the canonical set (e.g. a legacy 'confirmed'/'served' row the DB CHECK still
 * permits). Prefer this over indexing STATUS_STYLES directly.
 */
export function getStatusStyle(status: string | null | undefined): StatusStyle {
  return (status && STATUS_STYLES[status as OrderStatus]) || STATUS_STYLES.pending;
}

// ─── Chart Colors (OKLCH equidistant) ───────────────────
// Generates N perceptually uniform colors for charts.
// All at the same lightness and chroma, evenly spaced in hue.

function generateChartColors(count: number, startHue = 128): string[] {
  return Array.from(
    { length: count },
    (_, i) => `oklch(0.70 0.15 ${(startHue + (i * 360) / count) % 360})`,
  );
}

/** Default 8-color palette for reports/charts */
export const CHART_PALETTE = generateChartColors(8);

/**
 * Neutral slice for catch-all chart buckets ("Autres" / "Others").
 * Gray on purpose: the catch-all is not a real category, so it must not
 * compete visually with the palette hues.
 */
export const CHART_NEUTRAL = 'oklch(0.85 0 0)';

/** Stock movement type styles using semantic tokens */
export const MOVEMENT_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  order_destock: {
    bg: 'bg-status-info-bg',
    text: 'text-status-info',
    border: 'border-status-info/20',
  },
  order_restock: {
    bg: 'bg-status-success-bg',
    text: 'text-status-success',
    border: 'border-status-success/20',
  },
  manual_add: {
    bg: 'bg-status-success-bg',
    text: 'text-status-success',
    border: 'border-status-success/20',
  },
  manual_remove: {
    bg: 'bg-status-error-bg',
    text: 'text-status-error',
    border: 'border-status-error/20',
  },
  adjustment: {
    bg: 'bg-status-warning-bg',
    text: 'text-status-warning',
    border: 'border-status-warning/20',
  },
  opening: { bg: 'bg-status-info-bg', text: 'text-status-info', border: 'border-status-info/20' },
  physical_count: {
    bg: 'bg-status-info-bg',
    text: 'text-status-info',
    border: 'border-status-info/20',
  },
};
