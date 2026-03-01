'use client';

import { cn } from '@/lib/utils';

export type Period = 'day' | 'week' | 'month';

interface PeriodSelectorProps {
  value: Period;
  onChange: (period: Period) => void;
  t: (key: string) => string;
}

const PERIODS: Period[] = ['day', 'week', 'month'];
const PERIOD_KEYS: Record<Period, string> = {
  day: 'periodDay',
  week: 'periodWeek',
  month: 'periodMonth',
};

export default function PeriodSelector({ value, onChange, t }: PeriodSelectorProps) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-app-bg p-1">
      {PERIODS.map((period) => (
        <button
          key={period}
          onClick={() => onChange(period)}
          className={cn(
            'px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-150 min-w-[60px]',
            value === period
              ? 'bg-accent text-accent-text'
              : 'text-app-text-secondary hover:text-app-text hover:bg-app-card',
          )}
        >
          {t(PERIOD_KEYS[period])}
        </button>
      ))}
    </div>
  );
}
