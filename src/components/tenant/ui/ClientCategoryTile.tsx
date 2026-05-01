'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Salad,
  Pizza,
  Soup,
  Wheat,
  Leaf,
  Cookie,
  CakeSlice,
  Wine,
  Coffee,
  Beef,
  Fish,
  Drumstick,
  Utensils,
  UtensilsCrossed,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { T } from '@/lib/ui/client-tokens';

const LUCIDE_MAP: Record<string, LucideIcon> = {
  salad: Salad,
  pizza: Pizza,
  soup: Soup,
  wheat: Wheat,
  leaf: Leaf,
  cookie: Cookie,
  cakeSlice: CakeSlice,
  cake: CakeSlice,
  wine: Wine,
  cup: Coffee,
  coffee: Coffee,
  beef: Beef,
  fish: Fish,
  drumstick: Drumstick,
  utensils: Utensils,
  utensilsCrossed: UtensilsCrossed,
};

export interface CategoryTileIcon {
  bg?: string;
  fg?: string;
  lucide?: string;
}

interface ClientCategoryTileProps {
  icon?: CategoryTileIcon;
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
}

export function ClientCategoryTile({
  icon = {},
  label,
  count,
  active,
  onClick,
}: ClientCategoryTileProps) {
  const IconCmp: LucideIcon = (icon.lucide ? LUCIDE_MAP[icon.lucide] : null) ?? Utensils;

  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className="p-0 h-auto w-full flex flex-col items-center"
      style={{ gap: 8, fontFamily: T.font }}
    >
      <div
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          borderRadius: T.r3,
          background: active ? T.ink : (icon.bg ?? T.ivory),
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <IconCmp size={36} color={active ? '#fff' : (icon.fg ?? T.ink)} strokeWidth={1.5} />
        {count != null && (
          <div
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              fontSize: 10,
              fontWeight: 700,
              background: '#fff',
              color: T.ink2,
              padding: '2px 6px',
              borderRadius: T.rPill,
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
          >
            {count}
          </div>
        )}
      </div>
      <span
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          color: T.ink2,
          textAlign: 'center',
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          width: '100%',
        }}
      >
        {label}
      </span>
    </Button>
  );
}
