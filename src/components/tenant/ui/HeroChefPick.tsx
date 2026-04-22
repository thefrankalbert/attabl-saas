'use client';

import Image from 'next/image';
import { ChevronRight, Utensils } from 'lucide-react';
import type { MenuItem } from '@/types/admin.types';
import { cn } from '@/lib/utils';

type HeroChefPickProps = {
  item: MenuItem;
  eyebrow: string;
  ctaLabel: string;
  onSelect: (item: MenuItem) => void;
  language?: 'fr' | 'en';
  className?: string;
};

function pickName(item: MenuItem, language: 'fr' | 'en'): string {
  return language === 'en' && item.name_en ? item.name_en : item.name;
}

function pickDescription(item: MenuItem, language: 'fr' | 'en'): string | undefined {
  return language === 'en' && item.description_en ? item.description_en : item.description;
}

function hasValidImage(url?: string): url is string {
  if (!url) return false;
  return !url.includes('placeholder') && !url.includes('default');
}

export function HeroChefPick({
  item,
  eyebrow,
  ctaLabel,
  onSelect,
  language = 'fr',
  className,
}: HeroChefPickProps) {
  const imageUrl = hasValidImage(item.image_url) ? item.image_url : null;
  const name = pickName(item, language);
  const description = pickDescription(item, language);

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      aria-label={`${eyebrow}: ${name}`}
      data-slot="hero-chef-pick"
      className={cn(
        'group relative block aspect-[16/11] w-full overflow-hidden rounded-[24px] bg-[color:var(--ink-12)] text-left shadow-[var(--sh-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--gold)]/60',
        className,
      )}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={name}
          fill
          sizes="(max-width: 768px) 100vw, 60vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          priority
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Utensils className="h-12 w-12 text-[color:var(--navy-60)]" aria-hidden />
        </div>
      )}

      <div
        className="absolute inset-0 bg-gradient-to-t from-[rgba(5,15,36,0.85)] from-0% via-[rgba(5,15,36,0.15)] via-70% to-transparent"
        aria-hidden
      />

      <div className="absolute inset-x-[18px] bottom-4 flex flex-col gap-1 text-white">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-[color:var(--gold-light)]">
          {eyebrow}
        </span>
        <h3 className="font-fraunces text-[22px] font-bold leading-[1.1] tracking-tight">{name}</h3>
        {description && (
          <p className="max-w-[240px] text-[12.5px] leading-[1.45] text-white/85 line-clamp-2">
            {description}
          </p>
        )}
        <span className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-bold text-[color:var(--navy)]">
          {ctaLabel}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>
    </button>
  );
}
