'use client';

import React from 'react';
import { ChefHat, Volume2, VolumeX, Maximize, Minimize, Flame, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { Order } from '@/types/admin.types';
import type { ColumnKey, ColumnConfig } from '@/hooks/useKitchenData';

interface KitchenFiltersProps {
  pendingOrders: Order[];
  preparingOrders: Order[];
  readyOrders: Order[];
  totalActive: number;
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
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

export default function KitchenFilters({
  pendingOrders,
  preparingOrders,
  readyOrders,
  totalActive,
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
  audioRef,
}: KitchenFiltersProps) {
  const t = useTranslations('kitchen');

  return (
    <>
      <audio ref={audioRef} preload="auto" />

      {/* ━━━ HEADER ━━━ */}
      <header className="h-12 sm:h-14 border-b border-white/[0.06] flex items-center justify-between px-2 sm:px-3 bg-neutral-900/90 backdrop-blur-sm shrink-0">
        {/* Left: Logo + counters */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <ChefHat className="w-5 h-5 text-amber-400" />
          <span className="font-black text-xs sm:text-sm tracking-tight mr-0.5 sm:mr-1">KDS</span>

          {/* Inline status counters */}
          <div className="flex items-center gap-1">
            {pendingOrders.length > 0 && (
              <div
                className={cn(
                  'flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-400/10',
                  pendingOrders.length > 3 && 'animate-pulse',
                )}
              >
                {pendingOrders.length > 3 && <Flame className="w-3 h-3 text-amber-400" />}
                <span className="font-mono text-xs xl:text-sm font-black text-amber-400 tabular-nums">
                  {pendingOrders.length}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-400/10">
              <span className="font-mono text-xs xl:text-sm font-black text-blue-400 tabular-nums">
                {preparingOrders.length}
              </span>
            </div>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-400/10">
              <span className="font-mono text-xs xl:text-sm font-black text-emerald-400 tabular-nums">
                {readyOrders.length}
              </span>
            </div>
            <span className="text-xs xl:text-sm text-neutral-600 ml-1 hidden md:inline tabular-nums font-mono">
              {t('inProgress', { count: totalActive })}
            </span>
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          <span className="text-xs xl:text-sm text-neutral-600 font-mono mr-1 hidden sm:inline tabular-nums">
            {lastUpdate.toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
          <button
            onClick={() => setShowMockData(!showMockData)}
            className={cn(
              'px-2 py-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-xs xl:text-sm font-bold uppercase tracking-wide transition-colors',
              showMockData
                ? 'bg-amber-400/20 text-amber-400'
                : 'text-neutral-600 hover:text-neutral-400',
            )}
          >
            Demo
          </button>
          <button
            onClick={toggleSound}
            className={cn(
              'p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors',
              soundEnabled
                ? 'bg-amber-400/20 text-amber-400'
                : 'text-neutral-600 hover:text-neutral-400',
            )}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-neutral-600 hover:text-neutral-400 transition-colors"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
          <button
            onClick={goBack}
            className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-neutral-600 hover:text-neutral-400 transition-colors"
            title={t('backToDashboard')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ━━━ MOBILE TAB BAR ━━━ */}
      <div className="flex md:hidden border-b border-white/[0.06] shrink-0">
        {(Object.keys(columns) as Array<ColumnKey>).map((key) => {
          const col = columns[key];
          const count = columnOrders[key].length;
          const isActive = activeTab === key;
          const borderColor =
            key === 'pending' ? '#fbbf24' : key === 'preparing' ? '#60a5fa' : '#34d399';
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-3 min-h-[44px] text-xs font-bold uppercase tracking-wide transition-colors',
                isActive ? 'border-b-2 text-white' : 'text-neutral-600',
              )}
              style={isActive ? { borderColor } : undefined}
            >
              <div className={cn('w-2 h-2 rounded-full', col.dot)} />
              {col.label}
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded text-xs xl:text-sm tabular-nums font-black',
                  col.countBadge,
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
