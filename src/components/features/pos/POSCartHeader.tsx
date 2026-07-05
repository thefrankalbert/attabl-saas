'use client';

import { Receipt, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

interface POSCartHeaderProps {
  orderNumber: number;
  onClear: () => void;
}

export function POSCartHeader({ orderNumber, onClear }: POSCartHeaderProps) {
  const t = useTranslations('pos');
  const tc = useTranslations('common');

  return (
    <div className="px-4 py-3 border-b border-app-border flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Receipt className="w-4 h-4 text-app-text-muted" />
        <span className="font-bold text-sm text-app-text tracking-tight">{t('cart')}</span>
        <span
          className="text-xs font-mono bg-app-elevated text-app-text-muted px-1.5 py-0.5 rounded"
          title={t('ticketNumberTooltip', { number: orderNumber })}
        >
          {String(orderNumber).padStart(2, '0')}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={tc('delete')}
        onClick={onClear}
        title={tc('delete')}
        className="w-9 h-9 text-app-text-muted hover:text-status-error"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
