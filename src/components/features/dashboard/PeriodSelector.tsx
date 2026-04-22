'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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
    <div className="flex items-center gap-1 rounded-[10px] bg-app-bg p-1">
      {PERIODS.map((period) => (
        <Button
          key={period}
          variant={value === period ? 'default' : 'ghost'}
          onClick={() => onChange(period)}
          className={cn(
            'px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider min-w-[60px] h-auto',
            value === period
              ? 'bg-accent text-accent-text'
              : 'text-app-text-secondary hover:text-app-text hover:bg-app-card',
          )}
        >
          {t(PERIOD_KEYS[period])}
        </Button>
      ))}
    </div>
  );
}
