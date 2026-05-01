'use client';

import { T } from '@/lib/ui/client-tokens';

const BADGE_STYLES: Record<string, { bg: string; fg: string }> = {
  new: { bg: '#0A0A0A', fg: '#fff' },
  pop: { bg: '#FFF4E5', fg: '#B45309' },
  veg: { bg: T.brandSoft, fg: T.brandDark },
  spicy: { bg: '#FCE9E6', fg: '#C2210B' },
  promo: { bg: T.brand, fg: '#fff' },
  soft: { bg: '#F0F0F0', fg: '#525252' },
  dark: { bg: 'rgba(10,10,10,0.85)', fg: '#fff' },
};

interface ClientBadgeProps {
  kind?: 'new' | 'pop' | 'veg' | 'spicy' | 'promo' | 'soft' | 'dark';
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export function ClientBadge({ kind = 'new', size = 'sm', style, children }: ClientBadgeProps) {
  const s = BADGE_STYLES[kind] ?? BADGE_STYLES.soft;
  const small = size === 'sm';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: small ? '3px 7px' : '5px 10px',
        borderRadius: T.rPill,
        background: s.bg,
        color: s.fg,
        fontSize: small ? 10.5 : 12,
        fontWeight: 700,
        letterSpacing: 0.1,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        fontFamily: T.font,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
