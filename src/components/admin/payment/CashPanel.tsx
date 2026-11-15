'use client';

import { useLocale, useTranslations } from 'next-intl';
import { X, Delete, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/currency';

// Standard POS keypad: 4 columns - digits + backspace/clear
const NUMPAD_KEYS = ['1', '2', '3', 'BACK', '4', '5', '6', 'C', '7', '8', '9', '00', '0'] as const;

interface CashPanelProps {
  currency: string;
  receivedAmount: number;
  amountRemaining: number;
  change: number;
  cashIsValid: boolean;
  quickAdd: readonly number[];
  onKey: (key: string) => void;
  onExact: () => void;
  onAdd: (delta: number) => void;
}

/** Cash received, change due, shortcuts and keypad of the payment screen. */
export function CashPanel({
  currency,
  receivedAmount,
  amountRemaining,
  change,
  cashIsValid,
  quickAdd,
  onKey,
  onExact,
  onAdd,
}: CashPanelProps) {
  const t = useTranslations('payment');
  const locale = useLocale();
  const showChange = cashIsValid && change > 0;

  return (
    <>
      <div className="grid grid-cols-2 gap-2 shrink-0">
        <div className="rounded-xl border border-app-border bg-app-elevated/40 p-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-app-text-muted">
            {t('received')}
          </p>
          <p className="mt-1 text-xl sm:text-2xl font-bold text-app-text tabular-nums leading-none">
            {formatCurrency(receivedAmount, currency)}
          </p>
          {!cashIsValid && amountRemaining > 0 && (
            <p className="mt-1.5 text-xs font-medium text-[var(--warning)]">
              {t('amountRemaining', { amount: formatCurrency(amountRemaining, currency) })}
            </p>
          )}
        </div>
        <div
          className={cn(
            'rounded-xl border p-3 text-center',
            showChange
              ? 'border-[var(--border)] bg-app-elevated/40'
              : 'border-app-border bg-app-elevated/40',
          )}
        >
          <p
            className={cn(
              'text-xs font-semibold uppercase tracking-widest',
              showChange ? 'text-[var(--success)]' : 'text-app-text-muted',
            )}
          >
            {t('change')}
          </p>
          <p
            className={cn(
              'mt-1 text-xl sm:text-2xl font-bold tabular-nums leading-none',
              showChange ? 'text-[var(--success)]' : 'text-app-text',
            )}
          >
            {formatCurrency(change, currency)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 shrink-0">
        <Button
          type="button"
          variant="outline"
          onClick={onExact}
          className="min-h-[44px] rounded-lg border-app-border bg-app-elevated/30 text-accent text-xs font-bold px-3 hover:bg-app-elevated"
        >
          {t('exactAmount')}
        </Button>
        {quickAdd.map((increment) => (
          <Button
            key={increment}
            type="button"
            variant="outline"
            onClick={() => onAdd(increment)}
            className="min-h-[44px] rounded-lg border-app-border bg-app-elevated/30 text-xs font-bold tabular-nums px-3"
          >
            <Plus className="w-3 h-3 mr-0.5 opacity-70" />
            {t('quickAdd', { amount: increment.toLocaleString(locale) })}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-1.5 sm:gap-2 shrink-0">
        {NUMPAD_KEYS.map((key) => (
          <Button
            key={key}
            type="button"
            variant="outline"
            onClick={() => onKey(key)}
            className={cn(
              'flex items-center justify-center rounded-xl border-app-border bg-app-elevated/50 min-h-[48px] sm:min-h-[52px] text-lg sm:text-xl font-bold text-app-text active:scale-95 touch-manipulation hover:bg-app-elevated',
              key === 'C' && 'text-[var(--destructive)]',
              key === 'BACK' && 'text-[var(--warning)]',
              key === '0' && 'col-span-2',
            )}
            aria-label={
              key === 'C' ? t('numpadClear') : key === 'BACK' ? t('numpadBackspace') : key
            }
          >
            {key === 'C' ? (
              <X className="h-5 w-5" />
            ) : key === 'BACK' ? (
              <Delete className="h-5 w-5" />
            ) : (
              key
            )}
          </Button>
        ))}
      </div>
    </>
  );
}
