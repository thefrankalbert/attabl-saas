import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string | ReactNode;
  seeAllHref?: string;
}

export function SectionHeader({ title, subtitle, seeAllHref }: Props) {
  return (
    <div className="flex items-end justify-between px-4 pb-3.5 pt-5">
      <div>
        <h2 className="text-[19px] font-semibold leading-tight tracking-[-0.03em] text-[var(--color-ink)]">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-[12.5px] text-[var(--color-ink-muted)]">{subtitle}</p>
        )}
      </div>
      {seeAllHref && (
        <Link
          href={seeAllHref}
          className="flex items-center gap-0.5 text-[13px] font-medium text-[var(--color-ink-2)]"
        >
          Tout voir <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
        </Link>
      )}
    </div>
  );
}
