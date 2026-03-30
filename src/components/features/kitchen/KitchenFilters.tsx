'use client';

import React from 'react';
import { ChefHat, Volume2, VolumeX, Maximize, Minimize, Flame, ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { Order } from '@/types/admin.types';
import type { ColumnKey, ColumnConfig } from '@/hooks/useKitchenData';

interface KitchenFiltersProps {
  pendingOrders: Order[];
  preparingOrders: Order[];
  readyOrders: Order[];
  columns: Record<ColumnKey, ColumnConfig>;
  columnOrders: Record<ColumnKey, Order[]>;
  activeTab: ColumnKey;
  setActiveTab: (tab: ColumnKey) => void;
  lastUpdate: Date;
  showMockData: boolean;
  setShowMockData: (v: boolean) => void;
  soundEnabled: boolean;
  toggleSound: () => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  goBack: () => void;
  /** @deprecated Audio element is now mounted globally via SoundContext */
  audioRef?: React.RefObject<HTMLAudioElement | null>;
  /** true = chef/admin full view, false = server/waiter simplified view */
  isChefView: boolean;
}

export default function KitchenFilters({
  pendingOrders,
  preparingOrders,
  readyOrders,
  columns,
  columnOrders,
  activeTab,
  setActiveTab,
  lastUpdate,
  showMockData,
  setShowMockData,
  soundEnabled,
  toggleSound,
  isFullscreen,
  toggleFullscreen,
  goBack,
  isChefView,
}: KitchenFiltersProps) {
  const t = useTranslations('kitchen');

  return (
    <>
      {/* ━━━ COMPACT HEADER ━━━ */}
      <header className="h-11 border-b border-white/[0.06] flex items-center justify-between px-2 sm:px-3 bg-neutral-900/80 shrink-0">
        {/* Left: Logo + counters */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <ChefHat className="w-4 h-4 text-app-text-secondary" />
          <span className="font-bold text-xs tracking-tight text-app-text-muted hidden sm:inline">
            {isChefView ? 'KDS' : t('readyForService')}
          </span>

          {/* Inline status pills */}
          <div className="flex items-center gap-1">
            {isChefView && (
              <div
                className={cn(
                  'flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10',
                  pendingOrders.length > 3 && 'animate-pulse',
                )}
              >
                {pendingOrders.length > 3 && <Flame className="w-3 h-3 text-amber-400" />}
                <span className="font-mono text-xs font-bold text-amber-400 tabular-nums">
                  {pendingOrders.length}
                </span>
              </div>
            )}
            {isChefView && (
              <div className="px-1.5 py-0.5 rounded bg-blue-500/10">
                <span className="font-mono text-xs font-bold text-blue-400 tabular-nums">
                  {preparingOrders.length}
                </span>
              </div>
            )}
            <div className="px-1.5 py-0.5 rounded bg-emerald-500/10">
              <span className="font-mono text-xs font-bold text-emerald-400 tabular-nums">
                {readyOrders.length}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-0.5">
          <span className="text-[10px] text-app-text-muted font-mono mr-1 hidden sm:inline tabular-nums">
            {lastUpdate.toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          {isChefView && (
            <button
              onClick={() => setShowMockData(!showMockData)}
              className={cn(
                'px-2 py-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[10px] font-bold uppercase tracking-wide transition-colors',
                showMockData
                  ? 'bg-white/10 text-white'
                  : 'text-app-text-muted hover:text-app-text-muted',
              )}
            >
              Demo
            </button>
          )}
          <button
            onClick={toggleSound}
            className={cn(
              'p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors',
              soundEnabled
                ? 'bg-white/10 text-white'
                : 'text-app-text-muted hover:text-app-text-muted',
            )}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-app-text-muted hover:text-app-text-muted transition-colors"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
          {!isFullscreen && (
            <button
              onClick={goBack}
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-app-text-muted hover:text-app-text-muted transition-colors"
              title={t('backToDashboard')}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* ━━━ MOBILE TAB BAR (chef view only) ━━━ */}
      {isChefView && (
        <div className="flex @md:hidden border-b border-white/[0.06] shrink-0">
          {(Object.keys(columns) as Array<ColumnKey>).map((key) => {
            const col = columns[key];
            const count = columnOrders[key].length;
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2.5 min-h-[44px] text-xs font-bold uppercase tracking-wide transition-colors',
                  isActive ? 'border-b-2 border-white/40 text-white' : 'text-app-text-muted',
                )}
              >
                <div className={cn('w-2 h-2 rounded-full', col.dot)} />
                {col.label}
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded text-xs tabular-nums font-black',
                    col.countBadge,
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
