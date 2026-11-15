'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface TipSelectorProps {
  presets: readonly number[];
  tipFixed: number;
  showCustomTip: boolean;
  customTip: string;
  onFixed: (amount: number) => void;
  onCustom: () => void;
  onCustomChange: (value: string) => void;
  /** Section title above the buttons (desktop column); the phone row has none. */
  withTitle?: boolean;
  className?: string;
}

const ACTIVE = 'border-accent/40 bg-accent/10 text-accent';
const IDLE =
  'border-app-border bg-app-elevated/30 text-app-text-secondary hover:bg-app-elevated/60';

/**
 * Tip choice: 0, the currency's presets, or a custom amount. One component for
 * the desktop column and the phone row (it was copied twice, with smaller touch
 * targets on the phone).
 */
export function TipSelector({
  presets,
  tipFixed,
  showCustomTip,
  customTip,
  onFixed,
  onCustom,
  onCustomChange,
  withTitle = false,
  className,
}: TipSelectorProps) {
  const t = useTranslations('payment');
  const locale = useLocale();

  const choice = (selected: boolean, label: string, onClick: () => void, key: string) => (
    <Button
      key={key}
      type="button"
      variant="outline"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'flex-1 rounded-lg py-2 min-h-[44px] text-xs font-bold tabular-nums',
        selected ? ACTIVE : IDLE,
      )}
    >
      {label}
    </Button>
  );

  return (
    <div className={cn('space-y-2', className)} role="group" aria-label={t('tip')}>
      {withTitle && (
        <p className="text-xs font-medium uppercase tracking-widest text-app-text-muted">
          {t('tip')}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {choice(!showCustomTip && tipFixed === 0, '0', () => onFixed(0), 'none')}
        {presets.map((amount) =>
          choice(
            !showCustomTip && tipFixed === amount,
            amount.toLocaleString(locale),
            () => onFixed(amount),
            String(amount),
          ),
        )}
        {choice(showCustomTip, t('customTip'), onCustom, 'custom')}
      </div>
      {showCustomTip && (
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          aria-label={t('customTip')}
          placeholder="0"
          value={customTip}
          onChange={(e) => onCustomChange(e.target.value)}
          className="w-full min-h-[44px] rounded-lg border border-app-border bg-app-elevated/30 px-3 py-2 text-base font-bold text-app-text placeholder:text-app-text-muted outline-none focus:border-accent/30"
        />
      )}
    </div>
  );
}
