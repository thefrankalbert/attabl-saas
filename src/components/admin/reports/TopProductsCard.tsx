'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { CurrencyFormatter, TopItem } from './reports.types';

interface TopProductsCardProps {
  topItems: TopItem[];
  fmt: CurrencyFormatter;
}

export function TopProductsCard({ topItems, fmt }: TopProductsCardProps) {
  const t = useTranslations('reports');

  return (
    <div className="bg-app-card border border-app-border/60 rounded-xl p-4">
      <h3 className="text-sm font-bold text-app-text mb-4">{t('top5Products')}</h3>
      <div className="space-y-3">
        {topItems.map((item, index) => (
          <div key={item.id} className="flex items-center justify-between group">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={cn(
                  'flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-[10px] font-bold',
                  index === 0 ? 'bg-accent/15 text-accent' : 'bg-app-elevated text-app-text-muted',
                )}
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-app-text truncate">{item.name}</p>
                <p className="text-[10px] text-app-text-muted">
                  {t('salesCount', { count: item.quantity })}
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-app-text tabular-nums shrink-0 ml-2">
              {fmt(item.revenue)}
            </span>
          </div>
        ))}
        {topItems.length === 0 && (
          <p className="text-sm text-app-text-muted text-center py-6">{t('noData')}</p>
        )}
      </div>
    </div>
  );
}
