'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { MenuItem } from '@/types/admin.types';
import { MENU_COLORS as C, tr, triggerAddFeedback } from '@/lib/tenant/menu-tokens';

export type BadgeKind = 'none' | 'new' | 'promo';

interface FeaturedItemCardProps {
  item: MenuItem;
  lang: string;
  price: string;
  badge: BadgeKind;
  onPress: () => void;
  onAdd: () => void;
}

export function FeaturedItemCard({
  item,
  lang,
  price,
  badge,
  onPress,
  onAdd,
}: FeaturedItemCardProps) {
  const t = useTranslations('tenant');
  const name = tr(lang, item.name, item.name_en);
  const rating = item.rating ?? 4.8;

  return (
    <div
      onClick={onPress}
      className="w-[180px] shrink-0 rounded-xl overflow-hidden cursor-pointer flex flex-col"
      style={{
        background: C.surface,
        border: `1px solid ${C.divider}`,
      }}
    >
      <div className="w-full h-[140px] relative" style={{ background: C.surfaceAlt }}>
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={name}
            fill
            sizes="180px"
            style={{ objectFit: 'cover' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke={C.divider}
              strokeWidth="1.5"
            >
              <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
            </svg>
          </div>
        )}
        {badge === 'new' && (
          <span
            className="absolute top-2 left-2 text-[11px] font-bold py-[3px] px-2 rounded-lg tracking-[0.5px]"
            style={{
              background: C.primary,
              color: C.textOnPrimary,
            }}
          >
            {lang === 'en' ? 'New' : 'Nouveau'}
          </span>
        )}
        {badge === 'promo' && (
          <span
            className="absolute top-2 left-2 text-[11px] font-bold py-[3px] px-2 rounded-lg tracking-[0.5px]"
            style={{
              background: C.promo,
              color: C.textOnPrimary,
            }}
          >
            {lang === 'en' ? 'Deal' : 'Offre'}
          </span>
        )}
        <Button
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            triggerAddFeedback();
            onAdd();
          }}
          aria-label={t('addShort')}
          className="absolute -bottom-2 right-2 w-7 h-7 rounded-full flex items-center justify-center px-0 py-0 h-7 w-7 active:scale-95 transition-transform"
          style={{ background: C.primary }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 2v10M2 7h10"
              stroke={C.textOnPrimary}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </Button>
      </div>
      <div className="p-3 pt-4 flex flex-col gap-1">
        <p
          className="text-sm font-semibold m-0 overflow-hidden leading-[19.6px]"
          style={{
            color: C.textPrimary,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            minHeight: '39.2px',
          }}
        >
          {name}
        </p>
        <div className="flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 12 12" fill={C.rating}>
            <path d="M6 0l1.76 3.58L12 4.16 8.88 7.1l.74 4.32L6 9.27 2.38 11.42l.74-4.32L0 4.16l4.24-.58z" />
          </svg>
          <span className="text-[13px] font-medium" style={{ color: C.textPrimary }}>
            {rating.toFixed(1)}
          </span>
        </div>
        <p className="text-[15px] font-bold m-0" style={{ color: C.textPrimary }}>
          {price}
        </p>
      </div>
    </div>
  );
}
