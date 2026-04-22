'use client';

import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

type SearchTriggerProps = {
  placeholder: string;
  ariaLabel: string;
  onClick: () => void;
  className?: string;
};

export function SearchTrigger({ placeholder, ariaLabel, onClick, className }: SearchTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      data-slot="search-trigger"
      className={cn(
        'mx-4 mt-2 flex h-12 w-[calc(100%-32px)] items-center gap-3 rounded-[10px] bg-[color:var(--cream-2)] px-4 transition-colors hover:bg-[color:var(--ink-6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--navy)]/20',
        className,
      )}
    >
      <Search className="h-[18px] w-[18px] text-[color:var(--ink-45)]" aria-hidden />
      <span className="flex-1 text-left text-sm text-[color:var(--ink-45)]">{placeholder}</span>
    </button>
  );
}
