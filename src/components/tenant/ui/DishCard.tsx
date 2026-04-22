'use client';

import Image from 'next/image';
import { Star, Utensils } from 'lucide-react';
import type { MenuItem } from '@/types/admin.types';
import { PriceTag } from './PriceTag';
import { Pill } from './Pill';
import { cn } from '@/lib/utils';

type DishCardProps = {
  item: MenuItem;
  onSelect: (item: MenuItem) => void;
  language?: 'fr' | 'en';
  priority?: boolean;
  className?: string;
};

function pickName(item: MenuItem, language: 'fr' | 'en'): string {
  return language === 'en' && item.name_en ? item.name_en : item.name;
}

function hasValidImage(url?: string): url is string {
  if (!url) return false;
  return !url.includes('placeholder') && !url.includes('default');
}

export function DishCard({
  item,
  onSelect,
  language = 'fr',
  priority = false,
  className,
}: DishCardProps) {
  const isUnavailable = item.is_available === false;
  const imageUrl = hasValidImage(item.image_url) ? item.image_url : null;
  const name = pickName(item, language);

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      disabled={isUnavailable}
      aria-label={name}
      className={cn(
        'group relative flex w-full flex-col overflow-hidden rounded-[20px] bg-[color:var(--paper)] text-left shadow-[var(--sh-soft)] transition-transform duration-150 hover:shadow-[var(--sh-raised)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--gold)]/40',
        isUnavailable && 'opacity-60',
        className,
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[color:var(--cream)]">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            priority={priority}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Utensils className="h-8 w-8 text-[color:var(--navy-60)]" aria-hidden />
          </div>
        )}

        {item.is_featured && (
          <Pill
            variant="default"
            className="absolute left-3 top-3 bg-[color:var(--gold)] text-[color:var(--bone)]"
          >
            Signature
          </Pill>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-fraunces text-base font-bold leading-tight text-[color:var(--navy)] line-clamp-2">
          {name}
        </h3>

        {item.rating != null && item.rating > 0 && (
          <div className="flex items-center gap-1 text-xs text-[color:var(--navy-60)]">
            <Star
              className="h-3.5 w-3.5 fill-[color:var(--gold)] text-[color:var(--gold)]"
              aria-hidden
            />
            <span className="font-normal text-[color:var(--navy-80)]">
              {item.rating.toFixed(1)}
            </span>
            {item.rating_count != null && (
              <span className="text-[color:var(--navy-60)]">({item.rating_count})</span>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between pt-1">
          <PriceTag amount={item.price} />
        </div>
      </div>
    </button>
  );
}
