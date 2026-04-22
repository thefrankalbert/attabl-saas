'use client';

import { cn } from '@/lib/utils';

type SectionHeaderProps = {
  title: string;
  seeAllLabel?: string;
  onSeeAll?: () => void;
  className?: string;
};

export function SectionHeader({ title, seeAllLabel, onSeeAll, className }: SectionHeaderProps) {
  return (
    <header
      data-slot="section-header"
      className={cn('mb-3 flex items-baseline justify-between px-4', className)}
    >
      <h2 className="m-0 text-lg font-bold leading-tight tracking-tight text-[color:var(--navy)]">
        {title}
      </h2>
      {seeAllLabel && onSeeAll && (
        <button
          type="button"
          onClick={onSeeAll}
          className="text-sm font-bold text-[color:var(--navy)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--navy)]/20 focus-visible:ring-offset-2"
        >
          {seeAllLabel}
        </button>
      )}
    </header>
  );
}
