'use client';

import Image from 'next/image';
import { UtensilsCrossed } from 'lucide-react';
import { cn } from '@/lib/utils';

type CategoryTileProps = {
  label: string;
  imageUrl?: string | null;
  onClick?: () => void;
  href?: string;
  className?: string;
  priority?: boolean;
};

export function CategoryTile({
  label,
  imageUrl,
  onClick,
  href,
  className,
  priority = false,
}: CategoryTileProps) {
  const inner = (
    <>
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          fill
          sizes="(max-width: 640px) 25vw, 120px"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          priority={priority}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[color:var(--cream-2)]">
          <UtensilsCrossed className="h-8 w-8 text-[color:var(--navy-60)]" aria-hidden />
        </div>
      )}
      <div
        className="absolute inset-0 bg-gradient-to-t from-[rgba(10,15,28,0.82)] via-[rgba(10,15,28,0.15)] to-transparent"
        aria-hidden
      />
      <span className="relative z-10 w-full px-2.5 pb-2 pt-0 text-left text-[11px] font-bold leading-[1.2] tracking-[-0.01em] text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.4)] line-clamp-2">
        {label}
      </span>
    </>
  );

  const wrapperClassName = cn(
    'group relative flex aspect-[3/4] w-full flex-col items-start justify-end overflow-hidden rounded-[14px] bg-[color:var(--ink-12)] shadow-[var(--sh-soft)] transition-transform duration-150 hover:shadow-[var(--sh-raised)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--gold)]/40',
    className,
  );

  if (href) {
    return (
      <a href={href} className={wrapperClassName} aria-label={label}>
        {inner}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} aria-label={label} className={wrapperClassName}>
      {inner}
    </button>
  );
}
