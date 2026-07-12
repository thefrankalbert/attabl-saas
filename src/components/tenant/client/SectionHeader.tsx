import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string | ReactNode;
  seeAllHref?: string;
  /** Translated label for the "see all" link (required when seeAllHref is set). */
  seeAllLabel?: string;
}

export function SectionHeader({ title, subtitle, seeAllHref, seeAllLabel }: Props) {
  return (
    <div className="flex items-end justify-between gap-3 px-4 pb-3.5 pt-5">
      <div className="min-w-0">
        <h2 className="truncate text-[18.5px] font-semibold leading-[1.15] tracking-[-0.6px] text-[var(--color-ink)]">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-[3px] text-[12.5px] tracking-[-0.1px] text-[var(--color-ink-muted)]">
            {subtitle}
          </p>
        )}
      </div>
      {seeAllHref && seeAllLabel && (
        <Link
          href={seeAllHref}
          className="flex shrink-0 items-center gap-0.5 text-[13px] font-medium text-[var(--color-accent)]"
        >
          {seeAllLabel} <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
        </Link>
      )}
    </div>
  );
}
