'use client';

import { Check } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import { Button } from '@/components/ui/button';
import { grandTotal, type OrderRecord } from './types';

interface TerminalOrderCardProps {
  order: OrderRecord;
  tenantSlug: string;
  currency: string;
  onReorder: (order: OrderRecord) => void;
}

export function TerminalOrderCard({
  order,
  tenantSlug,
  currency,
  onReorder,
}: TerminalOrderCardProps) {
  const t = useTranslations('tenant');
  const locale = useLocale();
  const dateLocale = locale.startsWith('fr') ? fr : undefined;
  const { formatDisplayPrice } = useDisplayCurrency();

  const dateStr = format(new Date(order.created_at), 'dd MMM, HH:mm', {
    locale: dateLocale,
  });
  const statusStr = order.status === 'cancelled' ? t('statusCancelled') : t('statusServed');

  return (
    <div className="relative flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-divider)] bg-white px-3.5 py-[13px]">
      <Link
        href={`/sites/${tenantSlug}/orders/${order.id}`}
        className="absolute inset-0 rounded-[var(--radius-card)]"
        aria-label={order.order_number}
      />
      <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[var(--radius-search)] bg-[var(--color-brand-light)]">
        <Check className="h-[18px] w-[18px] text-[var(--color-brand-dark)]" strokeWidth={2.4} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[12.5px] font-semibold tracking-[0.2px] text-[var(--color-ink)]">
          {order.order_number}
        </div>
        <div className="mt-px text-[11.5px] text-[var(--color-ink-muted)]">
          {dateStr} - {statusStr}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[13px] font-bold tabular-nums text-[var(--color-ink)]">
          {formatDisplayPrice(grandTotal(order), currency)}
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onReorder(order)}
          className="relative z-10 mt-0.5 h-auto p-0 text-[10.5px] font-semibold text-[var(--color-accent)] hover:bg-transparent"
        >
          {t('reorderShort')}
        </Button>
      </div>
    </div>
  );
}
