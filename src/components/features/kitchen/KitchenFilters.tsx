'use client';

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Maximize, Minimize } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

type FilterTab = 'active' | 'scheduled' | 'completed';

interface KitchenFiltersProps {
  activeCount: number;
  scheduledCount: number;
  completedCount: number;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  goBack: () => void;
  isChefView: boolean;
}

export default function KitchenFilters({
  activeCount,
  scheduledCount,
  completedCount,
  isFullscreen,
  toggleFullscreen,
  goBack,
  isChefView,
}: KitchenFiltersProps) {
  const t = useTranslations('kitchen');
  const locale = useLocale();
  const [currentTab, setCurrentTab] = useState<FilterTab>('active');
  const [now, setNow] = useState(() => new Date());

  // Live clock - update every second
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'active', label: t('tabActive'), count: activeCount },
    { key: 'scheduled', label: t('tabScheduled'), count: scheduledCount },
    { key: 'completed', label: t('tabCompleted'), count: completedCount },
  ];

  const dateStr = now.toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return (
    <header className="h-12 border-b border-app-border flex items-center justify-between px-2 sm:px-4 bg-app-bg shrink-0">
      {/* Left: back / search */}
      <div className="flex items-center gap-1">
        {!isFullscreen && (
          <button
            onClick={goBack}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-app-text-muted hover:text-app-text transition-colors"
            title={t('backToDashboard')}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Center: filter tabs */}
      {isChefView && (
        <div className="flex items-center gap-0.5">
          {tabs.map((tab) => {
            const isActive = currentTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setCurrentTab(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold tracking-wide transition-colors',
                  isActive
                    ? 'bg-app-elevated text-app-text'
                    : 'text-app-text-muted hover:text-app-text-secondary',
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded text-xs tabular-nums font-black',
                    isActive ? 'bg-app-hover text-app-text' : 'text-app-text-muted',
                  )}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Right: date/time + fullscreen */}
      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-app-text-muted font-mono tabular-nums">
          <span>{dateStr}</span>
          <span className="text-app-text-secondary font-semibold">{timeStr}</span>
        </div>
        <button
          onClick={toggleFullscreen}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-app-text-muted hover:text-app-text transition-colors"
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
}
