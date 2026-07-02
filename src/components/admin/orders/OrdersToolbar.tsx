'use client';

import { useState, useRef, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Search, Volume2, VolumeX } from 'lucide-react';
import { useSound } from '@/contexts/SoundContext';
import { useSegmentTerms } from '@/hooks/useSegmentTerms';
import { cn } from '@/lib/utils';
import SoundPicker from './SoundPicker';

interface OrdersToolbarProps {
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  statusFilter: string;
  setStatusFilter: Dispatch<SetStateAction<string>>;
}

/** Search input + status tabs + sound settings button (with long-press picker). */
export default function OrdersToolbar({
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
}: OrdersToolbarProps) {
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const seg = useSegmentTerms();
  const { soundEnabled, toggleSound } = useSound();

  const [showSoundPicker, setShowSoundPicker] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const handleSoundPointerDown = useCallback(() => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setShowSoundPicker(true);
    }, 500);
  }, []);

  const handleSoundPointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!longPressTriggered.current) {
      toggleSound();
    }
  }, [toggleSound]);

  const handleSoundPointerLeave = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  return (
    <div className="shrink-0">
      {/* Search + Tabs + Sound - wraps on mobile/tablet portrait */}
      <div className="flex flex-wrap @lg:flex-nowrap items-center gap-2 @sm:gap-3 overflow-x-auto scrollbar-hide">
        <div className="relative w-full @lg:w-auto @lg:min-w-48 shrink-0">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-app-text-muted" />
          <Input
            data-search-input
            placeholder={t('searchTable')}
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="shrink-0 max-w-full">
          <TabsList className="overflow-x-auto scrollbar-hide">
            <TabsTrigger value="all">{t('tabAll')}</TabsTrigger>
            <TabsTrigger value="active">{t('tabInProgress')}</TabsTrigger>
            <TabsTrigger value="pending">{t('tabPending')}</TabsTrigger>
            <TabsTrigger value="preparing">{seg.inProduction}</TabsTrigger>
            <TabsTrigger value="ready">{t('tabReady')}</TabsTrigger>
            <TabsTrigger value="delivered">{t('tabCompleted')}</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative shrink-0 ml-auto">
          <Button
            variant="outline"
            size="icon"
            aria-label="Sound settings"
            onPointerDown={handleSoundPointerDown}
            onPointerUp={handleSoundPointerUp}
            onPointerLeave={handleSoundPointerLeave}
            className={cn(
              'select-none',
              soundEnabled && 'text-accent border-accent bg-accent-muted',
            )}
            title={soundEnabled ? tc('soundEnabled') : tc('soundDisabled')}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>

          {/* Sound picker popover - opens on long press */}
          {showSoundPicker && <SoundPicker onClose={() => setShowSoundPicker(false)} />}
        </div>
      </div>
    </div>
  );
}
