import { useTranslations } from 'next-intl';
import { ArrowUpRight, ArrowDownRight, Box } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StockHistoryStatsProps {
  stats: { additions: number; removals: number; uniqueIngredients: number };
}

export default function StockHistoryStats({ stats }: StockHistoryStatsProps) {
  const t = useTranslations('stockHistory');
  return (
    <div className="flex items-stretch rounded-xl border border-app-border/60 bg-app-card divide-x divide-app-border/60 overflow-hidden">
      <div className="flex-1 min-w-0 flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-3">
        <div className="hidden sm:flex w-9 h-9 rounded-lg bg-app-elevated items-center justify-center shrink-0">
          <ArrowUpRight
            className={cn(
              'w-4 h-4',
              stats.additions > 0 ? 'text-status-success' : 'text-app-text-muted',
            )}
          />
        </div>
        <div className="min-w-0">
          <p
            className={cn(
              'text-xl font-bold tabular-nums leading-none',
              stats.additions > 0 ? 'text-status-success' : 'text-app-text-muted',
            )}
          >
            +{stats.additions}
          </p>
          <p className="mt-1 text-xs font-medium text-app-text-muted">{t('statsAdditions')}</p>
        </div>
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-3">
        <div className="hidden sm:flex w-9 h-9 rounded-lg bg-app-elevated items-center justify-center shrink-0">
          <ArrowDownRight
            className={cn(
              'w-4 h-4',
              stats.removals > 0 ? 'text-status-error' : 'text-app-text-muted',
            )}
          />
        </div>
        <div className="min-w-0">
          <p
            className={cn(
              'text-xl font-bold tabular-nums leading-none',
              stats.removals > 0 ? 'text-status-error' : 'text-app-text-muted',
            )}
          >
            -{stats.removals}
          </p>
          <p className="mt-1 text-xs font-medium text-app-text-muted">{t('statsRemovals')}</p>
        </div>
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-3">
        <div className="hidden sm:flex w-9 h-9 rounded-lg bg-app-elevated items-center justify-center shrink-0">
          <Box className="w-4 h-4 text-app-text-muted" />
        </div>
        <div className="min-w-0">
          <p className="text-xl font-bold text-app-text tabular-nums leading-none">
            {stats.uniqueIngredients}
          </p>
          <p className="mt-1 text-xs font-medium text-app-text-muted">{t('statsProducts')}</p>
        </div>
      </div>
    </div>
  );
}
