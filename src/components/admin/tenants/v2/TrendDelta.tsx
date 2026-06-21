import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

interface TrendDeltaProps {
  current: number;
  previous: number;
  className?: string;
  /** Optional accessible label prefix (e.g. "vs yesterday"). */
  label?: string;
  /** Translated marker shown when growth comes from a zero baseline (e.g. "New"). */
  newLabel: string;
}

/**
 * Tiny presentational trend indicator: arrow + percent change in mono.
 * Positive => accent, negative => danger, flat / no baseline => muted dash.
 *
 * Guards previous === 0 to avoid a divide-by-zero: a jump from nothing to a
 * positive value renders an up-arrow with a plain "new" marker (no percent).
 *
 * Pure SVG icons, no hooks - safe to render inside a server component.
 */
export function TrendDelta({ current, previous, className, label, newLabel }: TrendDeltaProps) {
  const baseClass =
    `cc-mono inline-flex items-center gap-0.5 text-[10px] ${className ?? ''}`.trim();

  // No usable baseline: neutral dash.
  if (previous === 0 && current === 0) {
    return (
      <span className={baseClass} style={{ color: 'var(--cc-text-3)' }} aria-label={label}>
        -
      </span>
    );
  }

  // New activity from a zero baseline: up state without a percent.
  if (previous === 0) {
    return (
      <span className={baseClass} style={{ color: 'var(--cc-accent-ink)' }} aria-label={label}>
        <ArrowUpRight size={12} aria-hidden />
        {newLabel}
      </span>
    );
  }

  const change = ((current - previous) / previous) * 100;
  const rounded = Math.round(change * 10) / 10;

  if (rounded === 0) {
    return (
      <span className={baseClass} style={{ color: 'var(--cc-text-3)' }} aria-label={label}>
        0%
      </span>
    );
  }

  const positive = rounded > 0;
  const Arrow = positive ? ArrowUpRight : ArrowDownRight;
  const color = positive ? 'var(--cc-accent-ink)' : 'var(--cc-danger)';
  const sign = positive ? '+' : '-';

  return (
    <span className={baseClass} style={{ color }} aria-label={label}>
      <Arrow size={12} aria-hidden />
      {sign}
      {Math.abs(rounded)}%
    </span>
  );
}
