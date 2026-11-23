'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PERIOD_PILLS } from './reports.types';
import type { Period } from './reports.types';

interface PeriodPillsProps {
  period: Period;
  setPeriod: (p: Period) => void;
}

/** Selecteur de periode des rapports (aujourd'hui, 7, 30, 90 jours). */
export function PeriodPills({ period, setPeriod }: PeriodPillsProps) {
  const t = useTranslations('reports');
  return (
    <div className="flex items-center gap-1.5 md:gap-2.5 lg:gap-3 overflow-x-auto pb-0.5">
      {PERIOD_PILLS.map((pill) => (
        <Button
          key={pill.value}
          type="button"
          variant="outline"
          onClick={() => setPeriod(pill.value)}
          className={cn(
            'px-3 py-1.5 text-[11px] font-semibold rounded-lg whitespace-nowrap h-auto',
            period === pill.value
              ? 'bg-app-text text-app-bg border-app-text shadow-sm'
              : 'bg-app-card text-app-text-secondary border-app-border/50 hover:border-app-border hover:bg-app-elevated',
          )}
        >
          {t(pill.labelKey)}
        </Button>
      ))}
    </div>
  );
}
