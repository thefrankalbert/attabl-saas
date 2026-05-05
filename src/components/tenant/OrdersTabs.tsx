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
    <div className="flex gap-1 flex-1 pb-0">
      <Link
        href={`/sites/${tenantSlug}/orders`}
        className={cn(
          'px-4 py-3 text-[14px] font-semibold border-b-2 transition-colors',
          !showHistory ? 'border-[#1A1A1A] text-[#1A1A1A]' : 'border-transparent text-[#B0B0B0]',
        )}
      >
        {activeLabel}
      </Link>
      <Link
        href={`/sites/${tenantSlug}/orders?history=true`}
        className={cn(
          'px-4 py-3 text-[14px] font-semibold border-b-2 transition-colors',
          showHistory ? 'border-[#1A1A1A] text-[#1A1A1A]' : 'border-transparent text-[#B0B0B0]',
        )}
      >
        {historyLabel}
      </Link>
    </div>
  );
}
