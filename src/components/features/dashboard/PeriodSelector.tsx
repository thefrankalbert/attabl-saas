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
    <div className="flex items-center gap-1 rounded-xl bg-zinc-100 p-1">
      {PERIODS.map((period) => (
        <button
          key={period}
          onClick={() => onChange(period)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
            value === period
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700',
          )}
        >
          {t(PERIOD_KEYS[period])}
        </button>
      ))}
    </div>
  );
}
