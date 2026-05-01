'use client';

import { Star } from 'lucide-react';
import { T } from '@/lib/ui/client-tokens';

interface ClientRatingProps {
  value: number;
  count?: number;
  size?: number;
  style?: React.CSSProperties;
}

export function ClientRating({ value, count, size = 12, style }: ClientRatingProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: size,
        fontWeight: 600,
        color: T.ink2,
        fontFamily: T.font,
        ...style,
      }}
    >
      <Star size={size + 1} fill={T.ink} color={T.ink} strokeWidth={0.5} />
      {value.toFixed(1)}
      {count != null && <span style={{ color: T.ink4, fontWeight: 500 }}>({count})</span>}
    </span>
  );
}
