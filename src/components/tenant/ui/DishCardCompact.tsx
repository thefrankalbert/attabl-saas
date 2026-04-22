'use client';

import Image from 'next/image';
import { Clock, Plus, Star, Utensils } from 'lucide-react';
import type { MenuItem } from '@/types/admin.types';
import { PriceTag } from './PriceTag';
import { cn } from '@/lib/utils';

type DishCardCompactProps = {
  item: MenuItem;
  onSelect: (item: MenuItem) => void;
  onQuickAdd?: (item: MenuItem) => void;
  language?: 'fr' | 'en';
  quickAddLabel: string;
  className?: string;
};

function pickName(item: MenuItem, language: 'fr' | 'en'): string {
  return language === 'en' && item.name_en ? item.name_en : item.name;
}

function hasValidImage(url?: string): url is string {
  if (!url) return false;
  return !url.includes('placeholder') && !url.includes('default');
}

function hasModifiersOrVariants(item: MenuItem): boolean {
  const hasModifiers = !!item.modifiers && item.modifiers.length > 0;
  const hasVariants = !!item.price_variants && item.price_variants.length > 0;
  const hasOptions = !!item.options && item.options.length > 0;
  return hasModifiers || hasVariants || hasOptions;
}

export function DishCardCompact({
  item,
  onSelect,
  onQuickAdd,
  language = 'fr',
  quickAddLabel,
  className,
}: DishCardCompactProps) {
  const isUnavailable = item.is_available === false;
  const imageUrl = hasValidImage(item.image_url) ? item.image_url : null;
  const name = pickName(item, language);
  const needsDetail = hasModifiersOrVariants(item);

  const handleAdd = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (isUnavailable) return;
    if (needsDetail || !onQuickAdd) {
      onSelect(item);
      return;
    }
    onQuickAdd(item);
  };

  return (
    <article
      data-slot="dish-card-compact"
      className={cn(
        'relative flex w-[172px] flex-none flex-col overflow-hidden rounded-[18px] border border-[color:var(--hair)] bg-[color:var(--paper)] shadow-[var(--sh-soft)]',
        isUnavailable && 'opacity-60',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(item)}
        aria-label={name}
        className="relative block aspect-[4/3] w-full overflow-hidden bg-[color:var(--ink-12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--gold)]/60"
      >
        {imageUrl ? (
          <Image src={imageUrl} alt={name} fill sizes="172px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Utensils className="h-6 w-6 text-[color:var(--navy-60)]" aria-hidden />
          </div>
        )}
        {item.rating != null && item.rating > 0 && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-[3px] rounded-full bg-white/[0.94] px-[7px] py-[3px] text-[10.5px] font-bold text-[color:var(--navy)]">
            <Star
              className="h-[10px] w-[10px] fill-[color:var(--gold)] text-[color:var(--gold)]"
              aria-hidden
            />
            {item.rating.toFixed(1)}
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col px-[11px] pb-[11px] pt-2.5">
        <button
          type="button"
          onClick={() => onSelect(item)}
          className="text-left text-[13px] font-bold leading-[1.25] text-[color:var(--navy)] line-clamp-1 focus-visible:outline-none"
        >
          {name}
        </button>
        {item.calories != null && item.calories > 0 ? (
          <div className="mt-0.5 flex items-center gap-1 text-[10.5px] text-[color:var(--ink-45)]">
            <Clock className="h-[11px] w-[11px]" aria-hidden />
            <span>{item.calories} kcal</span>
          </div>
        ) : null}
        <div className="mt-2.5 flex items-center justify-between">
          <PriceTag amount={item.price} variant="display" />
          <button
            type="button"
            onClick={handleAdd}
            disabled={isUnavailable}
            aria-label={quickAddLabel}
            className="grid h-7 w-7 place-items-center rounded-full bg-[color:var(--navy)] text-white shadow-[0_4px_10px_-3px_rgba(11,30,63,0.4)] transition-colors hover:bg-[color:var(--navy-600)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--gold)]/60 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-[13px] w-[13px]" aria-hidden />
          </button>
        </div>
      </div>
    </article>
  );
}
