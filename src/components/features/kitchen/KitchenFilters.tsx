'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Maximize, Minimize, ChefHat, Wine, Search, X } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  searchQuery: string;
  onSearchChange: (query: string) => void;
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
  searchQuery,
  onSearchChange,
}: KitchenFiltersProps) {
  const t = useTranslations('kitchen');
  const locale = useLocale();
  const [now, setNow] = useState(() => new Date());
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
    <header className="h-12 border-b border-app-border flex items-center justify-between px-2 @sm:px-4 bg-app-bg shrink-0">
      {/* Left: back / search */}
      <div className="flex items-center gap-1">
        {!isFullscreen && (
          <Button variant="ghost" size="icon" onClick={goBack} title={t('backToDashboard')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
        )}
        {searchOpen ? (
          <div className="flex items-center gap-1 bg-app-elevated rounded-lg px-2 py-1">
            <Search className="w-4 h-4 text-app-text-muted shrink-0" />
            <Input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="bg-transparent text-xs text-app-text placeholder:text-app-text-muted outline-none w-40 @sm:w-56 border-0 shadow-none focus-visible:ring-0 p-0 h-auto"
              autoFocus
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                onSearchChange('');
                setSearchOpen(false);
              }}
              className="h-8 w-8"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setSearchOpen(true);
              requestAnimationFrame(() => searchInputRef.current?.focus());
            }}
            aria-label={t('searchLabel')}
          >
            <Search className="w-4 h-4" />
          </Button>
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
            <Button
              key={key}
              type="button"
              variant={zoneFilter === key ? 'default' : 'ghost'}
              onClick={() => onZoneFilterChange(key)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold tracking-wide h-auto',
                zoneFilter === key
                  ? 'bg-accent text-accent-text shadow-sm'
                  : 'text-app-text-muted hover:text-app-text',
              )}
            >
              {Icon && <Icon className="w-3 h-3" />}
              {label}
            </Button>
          ))}
        </div>
      )}

      {/* Center: active / completed tabs */}
      {isChefView && (
        <nav className="flex items-center bg-app-elevated/50 rounded-full p-0.5">
          {(
            [
              { mode: 'active' as const, label: t('tabActive'), count: activeCount },
              { mode: 'completed' as const, label: t('tabCompleted'), count: completedToday },
            ] as const
          ).map(({ mode, label, count }) => (
            <Button
              key={mode}
              type="button"
              variant="ghost"
              onClick={() => onViewModeChange(mode)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-1 rounded-full text-xs font-normal h-auto',
                viewMode === mode
                  ? 'bg-app-bg text-app-text shadow-sm'
                  : 'text-app-text-muted hover:text-app-text-secondary',
              )}
            >
              {label}
              <span
                className={cn(
                  'min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold tabular-nums',
                  viewMode === mode
                    ? 'bg-accent text-accent-text'
                    : 'bg-app-hover text-app-text-muted',
                )}
              >
                {count}
              </span>
            </Button>
          ))}
        </nav>
      )}

      {/* Right: date/time + fullscreen */}
      <div className="flex items-center gap-2">
        <div className="hidden @sm:flex items-center gap-3 text-xs text-app-text-muted tabular-nums">
          <span className="capitalize">{dateStr}</span>
          <span>{timeStr}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </Button>
      </div>
    </header>
  );
}
