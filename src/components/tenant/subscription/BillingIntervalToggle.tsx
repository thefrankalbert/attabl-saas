'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { BillingInterval } from '@/types/billing';
import { BILLING_INTERVALS, intervalSavingsPct } from './pricing-format';

interface BillingIntervalToggleProps {
  value: BillingInterval;
  onChange: (interval: BillingInterval) => void;
}

/**
 * Segmented control for the billing interval. The yearly / semiannual options
 * surface their savings as a semantic success badge instead of baking "-20%"
 * into the label text.
 */
export function BillingIntervalToggle({ value, onChange }: BillingIntervalToggleProps) {
  const t = useTranslations('admin');

  const label: Record<BillingInterval, string> = {
    monthly: t('subscription.monthly'),
    yearly: t('subscription.yearly'),
    semiannual: t('subscription.semiannual'),
  };

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-app-border bg-app-elevated p-1">
      {BILLING_INTERVALS.map((interval) => {
        const isActive = value === interval;
        const savings = intervalSavingsPct(interval);
        return (
          <Button
            key={interval}
            variant="ghost"
            onClick={() => onChange(interval)}
            aria-pressed={isActive}
            className={cn(
              'h-8 gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors',
              isActive
                ? 'bg-app-card text-app-text shadow-sm ring-1 ring-app-border hover:bg-app-card'
                : 'text-app-text-muted hover:bg-transparent hover:text-app-text',
            )}
          >
            {label[interval]}
            {savings > 0 && (
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
                  isActive
                    ? 'bg-status-success-bg text-status-success'
                    : 'bg-app-hover text-app-text-muted',
                )}
              >
                -{savings}%
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
