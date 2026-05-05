import { Star } from 'lucide-react';

export interface RatingProps {
  value: number;
  count?: number | null;
  size?: number;
}

export function Rating({ value, count, size = 13 }: RatingProps) {
  return (
    <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--color-ink)]">
      <Star
        className="text-[var(--color-rating)]"
        style={{ width: size, height: size }}
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
