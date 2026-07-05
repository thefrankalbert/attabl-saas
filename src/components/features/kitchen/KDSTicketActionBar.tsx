'use client';

import { Printer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Order, KDSZoneFilter } from '@/types/admin.types';
import { printKitchenTicket } from '@/lib/printing/kitchen-ticket';

interface KDSTicketActionBarProps {
  order: Order;
  cta: { labelKey: string; bg: string };
  isMock: boolean;
  isDelayed: boolean;
  handleAction: () => void;
  elapsedStr: string;
  zoneFilter: KDSZoneFilter;
  barDisplayEnabled: boolean;
}

export default function KDSTicketActionBar({
  order,
  cta,
  isMock,
  isDelayed,
  handleAction,
  elapsedStr,
  zoneFilter,
  barDisplayEnabled,
}: KDSTicketActionBarProps) {
  const t = useTranslations('kitchen');

  return (
    <div className="flex items-stretch border-t border-app-border">
      {/* CTA button */}
      <Button
        onClick={handleAction}
        disabled={isMock}
        className={cn(
          'flex-1 min-h-[44px] flex items-center justify-between px-3 font-bold text-sm uppercase tracking-wide active:scale-[0.98] rounded-none',
          isDelayed
            ? 'bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:opacity-90'
            : cta.bg,
        )}
      >
        <span>{t(cta.labelKey)}</span>
        <span className="font-mono text-xs opacity-80">{elapsedStr}</span>
      </Button>

      {/* Print button */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Print"
        onClick={() => printKitchenTicket(order, { zoneFilter, barDisplayEnabled })}
        className="w-11 min-h-[44px] border-l border-app-border bg-app-elevated hover:bg-app-hover rounded-none"
        title="Print"
      >
        <Printer className="w-4 h-4 text-app-text-muted" />
      </Button>
    </div>
  );
}
