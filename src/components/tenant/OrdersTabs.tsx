'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

interface OrdersTabsProps {
  tenantSlug: string;
  showHistory: boolean;
  activeLabel: string;
  historyLabel: string;
}

export default function OrdersTabs({
  tenantSlug,
  showHistory,
  activeLabel,
  historyLabel,
}: OrdersTabsProps) {
  return (
    <div className="inline-flex w-fit items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--color-divider)] bg-[var(--color-surface-alt)] p-[3px]">
      <Link
        href={`/sites/${tenantSlug}/orders`}
        className={cn(
          'rounded-[var(--radius-pill)] px-4 py-1.5 text-[12.5px] font-medium tracking-[-0.2px] transition-colors',
          !showHistory ? 'bg-[var(--color-ink)] text-white' : 'text-[var(--color-ink-muted)]',
        )}
      >
        {activeLabel}
      </Link>
      <Link
        href={`/sites/${tenantSlug}/orders?history=true`}
        className={cn(
          'rounded-[var(--radius-pill)] px-4 py-1.5 text-[12.5px] font-medium tracking-[-0.2px] transition-colors',
          showHistory ? 'bg-[var(--color-ink)] text-white' : 'text-[var(--color-ink-muted)]',
        )}
      >
        {historyLabel}
      </Link>
    </div>
  );
}
