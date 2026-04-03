'use client';

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Maximize, Minimize, ChefHat, Wine } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { KDSZoneFilter } from '@/types/admin.types';

interface KitchenFiltersProps {
  activeCount: number;
  completedToday: number;
  viewMode: 'active' | 'completed';
  onViewModeChange: (mode: 'active' | 'completed') => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  goBack: () => void;
  isChefView: boolean;
  barDisplayEnabled?: boolean;
  zoneFilter?: KDSZoneFilter;
  onZoneFilterChange?: (zone: KDSZoneFilter) => void;
}

export default function KitchenFilters({
  activeCount,
  completedToday,
  viewMode,
  onViewModeChange,
  isFullscreen,
  toggleFullscreen,
  goBack,
  isChefView,
  barDisplayEnabled = false,
  zoneFilter = 'all',
  onZoneFilterChange,
}: KitchenFiltersProps) {
  const t = useTranslations('kitchen');
  const locale = useLocale();
  const [now, setNow] = useState(() => new Date());

  // Live clock - update every second
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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

      {/* Zone filter (only when bar display is enabled) */}
      {barDisplayEnabled && onZoneFilterChange && (
        <div className="flex items-center gap-0.5 bg-app-elevated rounded-md p-0.5">
          {(
            [
              { key: 'all' as const, label: t('zoneAll'), icon: null },
              { key: 'kitchen' as const, label: t('zoneKitchen'), icon: ChefHat },
              { key: 'bar' as const, label: t('zoneBar'), icon: Wine },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onZoneFilterChange(key)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold tracking-wide transition-colors',
                zoneFilter === key
                  ? 'bg-accent text-accent-text shadow-sm'
                  : 'text-app-text-muted hover:text-app-text',
              )}
            >
              {Icon && <Icon className="w-3 h-3" />}
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Center: active / completed tabs */}
      {isChefView && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onViewModeChange('active')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold tracking-wide transition-colors',
              viewMode === 'active'
                ? 'bg-app-elevated text-app-text'
                : 'text-app-text-muted hover:text-app-text-secondary',
            )}
          >
            {t('tabActive')}
            <span
              className={cn(
                'px-1.5 py-0.5 rounded text-xs tabular-nums font-black',
                viewMode === 'active' ? 'bg-app-hover text-app-text' : 'text-app-text-muted',
              )}
            >
              {activeCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('completed')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold tracking-wide transition-colors',
              viewMode === 'completed'
                ? 'bg-app-elevated text-app-text'
                : 'text-app-text-muted hover:text-app-text-secondary',
            )}
          >
            {t('tabCompleted')}
            <span
              className={cn(
                'px-1.5 py-0.5 rounded text-xs tabular-nums font-black',
                viewMode === 'completed' ? 'bg-app-hover text-app-text' : 'text-app-text-muted',
              )}
            >
              {completedToday}
            </span>
          </button>
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
