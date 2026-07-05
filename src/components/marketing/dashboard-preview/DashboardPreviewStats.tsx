'use client';

import { useTranslations } from 'next-intl';
import { MiniAreaChart, MiniGauge } from './DashboardPreviewCharts';
import { chartValues, dayKeys, gaugeData, avgBasket, type Segment } from './dashboard-preview.data';

export function DashboardPreviewStats({ segment }: { segment: Segment }) {
  const t = useTranslations('marketing.home.videoHero.preview');
  const gauge = gaugeData[segment];
  const chart = chartValues[segment];
  const basket = avgBasket[segment];

  return (
    <div className="flex flex-1 flex-col gap-1.5 min-w-0">
      {/* Stats Gauge Card */}
      <div className="flex items-center gap-2 rounded-lg border border-app-border bg-app-card px-2 py-1.5">
        <div className="shrink-0 w-14">
          <MiniGauge data={gauge} />
        </div>
        <div className="flex-1 grid grid-cols-2 gap-x-2 gap-y-0.5 min-w-0">
          {gauge.map((g) => (
            <div key={g.statKey} className="flex items-center gap-1 min-w-0">
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ backgroundColor: g.color }}
              />
              <span className="text-[10px] text-app-text-muted truncate">
                {t(`stats.${g.statKey}`)}
              </span>
              <span className="text-[10px] font-bold text-app-text tabular-nums ml-auto shrink-0">
                {g.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chart (Area Chart like real dashboard) */}
      <div className="flex-1 rounded-lg border border-app-border bg-app-card p-2 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-1 shrink-0">
          <div>
            <span className="text-[10px] font-semibold text-app-text-muted uppercase tracking-wider">
              {t('revenue7Days')}
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-[11px] font-black text-app-text tabular-nums">
                {chart.total}
              </span>
            </div>
          </div>
          <div className="flex rounded bg-app-elevated p-0.5 shrink-0">
            <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-text">
              {t('revenue')}
            </span>
            <span className="px-1.5 py-0.5 text-[10px] font-bold text-app-text-muted">
              {t('ordersShort')}
            </span>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <MiniAreaChart points={chart.points} color="#4ade80" height={60} />
        </div>
        <div className="flex justify-between mt-0.5">
          {dayKeys.map((d) => (
            <span key={d} className="text-[10px] text-app-text-muted flex-1 text-center">
              {t(`days.${d}`)}
            </span>
          ))}
        </div>
      </div>

      {/* Avg Basket (mini blue chart like real dashboard) */}
      <div className="rounded-lg border border-app-border bg-app-card p-2">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] font-semibold text-app-text-muted uppercase tracking-wider">
            {t('avgBasket')}
          </span>
          <span className="text-[10px] font-black text-app-text tabular-nums">{basket.value}</span>
        </div>
        <MiniAreaChart points={basket.points} color="#3b82f6" height={28} />
      </div>

      {/* Quick Action Buttons */}
      <div className="hidden sm:flex gap-1">
        {(['qrCodes', 'reports', 'stock'] as const).map((key) => (
          <div
            key={key}
            className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 border border-app-border rounded-lg"
          >
            <div className="h-2 w-2 rounded-sm bg-app-text-muted/20" />
            <span className="text-[10px] text-app-text-secondary font-medium">
              {t(`quickActions.${key}`)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
