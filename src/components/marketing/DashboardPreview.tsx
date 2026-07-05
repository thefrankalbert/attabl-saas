'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { brandNames, type Segment } from './dashboard-preview/dashboard-preview.data';
import { DashboardPreviewStats } from './dashboard-preview/DashboardPreviewStats';
import { DashboardPreviewOrders } from './dashboard-preview/DashboardPreviewOrders';

interface DashboardPreviewProps {
  segment: Segment;
  className?: string;
}

export default function DashboardPreview({ segment, className }: DashboardPreviewProps) {
  const t = useTranslations('marketing.home.videoHero.preview');
  const brand = brandNames[segment];

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl shadow-neutral-900/10 dark:shadow-black/30',
        className,
      )}
    >
      {/* Window Chrome */}
      <div className="flex items-center gap-1.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800 px-3 py-2">
        <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <div className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
        <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
        <span className="ml-2 text-[10px] font-medium text-neutral-400 dark:text-neutral-500">
          app.attabl.com
        </span>
      </div>

      {/* App Shell */}
      <div className="flex" style={{ height: 340 }}>
        {/* Sidebar */}
        <div className="hidden sm:flex w-14 flex-col items-center gap-1.5 border-r border-app-border bg-app-card py-3 px-1">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-accent-muted">
            <span className="text-[10px] font-black text-accent">A</span>
          </div>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg',
                i === 0 && 'bg-accent-muted',
              )}
            >
              <div
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  i === 0 ? 'bg-accent' : 'bg-app-text-muted/30',
                )}
              />
            </div>
          ))}
          <div className="flex-1" />
          <div className="flex h-7 w-7 items-center justify-center rounded-lg">
            <div className="h-1.5 w-1.5 rounded-full bg-app-text-muted/30" />
          </div>
        </div>

        {/* Main */}
        <div className="flex flex-1 flex-col bg-app-bg min-w-0">
          {/* Top Bar */}
          <div className="flex h-8 items-center justify-between border-b border-app-border px-3 shrink-0">
            <span className="text-[10px] text-app-text-muted">{t('dashboard')}</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-app-text-muted">14:32</span>
              <div className="h-5 w-5 rounded-full bg-app-elevated" />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden p-2 sm:p-3">
            {/* Greeting */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] sm:text-[10px] font-bold text-app-text">
                {t('greeting')} {brand}
              </span>
              <span className="text-[10px] text-app-text-muted hidden sm:inline">{t('date')}</span>
            </div>

            {/* Two columns */}
            <div className="flex gap-2 h-[calc(100%-24px)]">
              {/* Left Column */}
              <DashboardPreviewStats segment={segment} />

              {/* Right Column - Orders */}
              <DashboardPreviewOrders segment={segment} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
