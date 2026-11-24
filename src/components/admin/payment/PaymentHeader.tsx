'use client';

import { useTranslations } from 'next-intl';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaymentHeaderProps {
  orderNumber?: string | number;
  table?: string;
  onBack: () => void;
  /** No leaving while a payment is in flight: the cashier would lose its result. */
  busy: boolean;
}

/** Top bar of the payment screen, kept below the notch of an installed PWA. */
export function PaymentHeader({ orderNumber, table, onBack, busy }: PaymentHeaderProps) {
  const t = useTranslations('payment');
  const tc = useTranslations('common');

  return (
    <header className="h-[calc(3rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] border-b border-app-border flex items-center justify-between px-3 sm:px-5 shrink-0">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={tc('aria.back')}
          onClick={onBack}
          disabled={busy}
          className="-ml-2 min-h-[44px] min-w-[44px]"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        {/* Title of the payment dialog (Radix names the dialog after it). */}
        <DialogPrimitive.Title className="font-bold text-sm sm:text-base">
          {t('title')}
        </DialogPrimitive.Title>
        {orderNumber && (
          <span className="text-xs font-mono text-app-text-muted">#{orderNumber}</span>
        )}
      </div>
      {/* "CMD-<n>" is a tableless POS ticket id, not a table - do not label it "Table" */}
      {table && !/^CMD-/i.test(table) && (
        <span className="text-xs sm:text-sm text-app-text-muted">{t('tableLabel', { table })}</span>
      )}
    </header>
  );
}
