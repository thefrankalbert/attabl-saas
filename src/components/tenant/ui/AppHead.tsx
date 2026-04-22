'use client';

import Image from 'next/image';
import { ChevronDown, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

type AppHeadProps = {
  locationKicker: string;
  venueName: string;
  logoUrl?: string | null;
  logoAltText: string;
  onLocationPress?: () => void;
  onLogoPress?: () => void;
  className?: string;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts
    .map((p) => p.charAt(0).toUpperCase())
    .join('')
    .slice(0, 3);
}

export function AppHead({
  locationKicker,
  venueName,
  logoUrl,
  logoAltText,
  onLocationPress,
  onLogoPress,
  className,
}: AppHeadProps) {
  const hasLogo = !!logoUrl;
  return (
    <header
      data-slot="app-head"
      className={cn(
        'flex items-start justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)]',
        className,
      )}
    >
      <button
        type="button"
        onClick={onLocationPress}
        aria-label={`${locationKicker} ${venueName}`}
        className="group flex flex-col items-start gap-[2px] text-left focus-visible:outline-none"
      >
        <span className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[color:var(--ink-45)]">
          <MapPin className="h-3.5 w-3.5 text-[color:var(--gold-ink)]" aria-hidden />
          {locationKicker}
        </span>
        <span className="flex items-center gap-1.5 font-fraunces text-[17px] font-bold tracking-[-0.01em] text-[color:var(--navy)]">
          {venueName}
          <ChevronDown className="h-[13px] w-[13px] text-[color:var(--ink-45)]" aria-hidden />
        </span>
      </button>

      <button
        type="button"
        onClick={onLogoPress}
        aria-label={logoAltText}
        className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-full bg-[color:var(--navy)] shadow-[var(--sh-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--gold)]/40"
      >
        {hasLogo ? (
          <Image src={logoUrl!} alt={logoAltText} fill sizes="44px" className="object-cover" />
        ) : (
          <span className="text-[12px] font-extrabold tracking-[0.05em] text-white">
            {getInitials(venueName)}
          </span>
        )}
      </button>
    </header>
  );
}
