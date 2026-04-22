'use client';

import Image from 'next/image';
import { UtensilsCrossed } from 'lucide-react';
import { cn } from '@/lib/utils';

type VenueCardProps = {
  kicker: string;
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  href?: string;
  onClick?: () => void;
  priority?: boolean;
  className?: string;
};

function hasValidImage(url?: string | null): url is string {
  if (!url) return false;
  return !url.includes('placeholder') && !url.includes('default');
}

export function VenueCard({
  kicker,
  title,
  subtitle,
  imageUrl,
  href,
  onClick,
  priority = false,
  className,
}: VenueCardProps) {
  const safeImage = hasValidImage(imageUrl) ? imageUrl : null;
  const inner = (
    <>
      {safeImage ? (
        <Image
          src={safeImage}
          alt=""
          fill
          sizes="268px"
          className="object-cover"
          priority={priority}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[color:var(--cream-2)]">
          <UtensilsCrossed className="h-10 w-10 text-[color:var(--navy-60)]" aria-hidden />
        </div>
      )}
      <div
        className="absolute inset-0 bg-gradient-to-t from-[rgba(5,15,36,0.85)] from-40% to-transparent"
        aria-hidden
      />
      <div className="absolute inset-x-4 bottom-3.5 text-white">
        <div className="text-[9.5px] font-extrabold uppercase tracking-[0.25em] text-[color:var(--gold-light)]">
          {kicker}
        </div>
        <h4 className="mt-0.5 font-fraunces text-[18px] font-bold leading-[1.15] tracking-[-0.01em] line-clamp-2">
          {title}
        </h4>
        {subtitle && <div className="mt-1 text-[11px] text-white/80 line-clamp-1">{subtitle}</div>}
      </div>
    </>
  );

  const wrapperClassName = cn(
    'relative block aspect-[16/10] w-[268px] flex-none overflow-hidden rounded-[22px] shadow-[var(--sh-raised)] transition-transform duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--gold)]/50',
    className,
  );

  if (href) {
    return (
      <a href={href} aria-label={title} className={wrapperClassName}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={title} className={wrapperClassName}>
      {inner}
    </button>
  );
}
