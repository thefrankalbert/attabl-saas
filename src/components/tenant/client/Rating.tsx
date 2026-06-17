import { Star } from 'lucide-react';

export interface RatingProps {
  value: number;
  count?: number | null;
  size?: number;
}

export function Rating({ value, count, size = 13 }: RatingProps) {
  return (
    <span
      className="inline-flex items-center gap-1 font-semibold tabular-nums tracking-[-0.1px] text-[var(--color-ink-2)]"
      style={{ fontSize: size }}
    >
      <Star
        className="text-[var(--color-rating)]"
        style={{ width: size + 1, height: size + 1 }}
        fill="currentColor"
        strokeWidth={0}
      />
      {value.toFixed(1)}
      {count != null && (
        <span className="font-normal text-[var(--color-ink-muted)]">({count})</span>
      )}
    </span>
  );
}
