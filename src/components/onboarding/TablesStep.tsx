'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { OnboardingData } from '@/app/onboarding/page';
import { derivePrefix, type ConfigMode, type ZoneData } from './tables/types';
import { ModeSelector } from './tables/ModeSelector';
import { SkipState } from './tables/SkipState';
import { MinimumZones } from './tables/MinimumZones';
import { CompleteZones } from './tables/CompleteZones';

interface TablesStepProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
}

export function TablesStep({ data, updateData }: TablesStepProps) {
  const t = useTranslations('onboarding');

  const [mode, setMode] = useState<ConfigMode>(data.tableConfigMode || 'skip');
  const [zones, setZones] = useState<ZoneData[]>(
    data.tableZones && data.tableZones.length > 0
      ? data.tableZones
      : [{ name: '', prefix: '', tableCount: 10, defaultCapacity: 2 }],
  );

  const syncToParent = useCallback(
    (newZones: ZoneData[], newMode: ConfigMode) => {
      updateData({
        tableConfigMode: newMode,
        tableZones: newZones,
      });
    },
    [updateData],
  );

  const handleModeChange = (newMode: ConfigMode) => {
    setMode(newMode);
    syncToParent(zones, newMode);
  };

  const updateZone = (index: number, field: keyof ZoneData, value: string | number) => {
    const updated = [...zones];
    if (field === 'name') {
      updated[index] = {
        ...updated[index],
        name: value as string,
        prefix: derivePrefix(value as string),
      };
    } else if (field === 'prefix') {
      updated[index] = { ...updated[index], prefix: (value as string).toUpperCase() };
    } else if (field === 'tableCount') {
      updated[index] = { ...updated[index], tableCount: Math.max(1, Number(value)) };
    } else if (field === 'defaultCapacity') {
      updated[index] = { ...updated[index], defaultCapacity: Number(value) };
    }
    setZones(updated);
    syncToParent(updated, mode);
  };

  const addZone = () => {
    if (zones.length < 20) {
      const newZones = [...zones, { name: '', prefix: '', tableCount: 5, defaultCapacity: 2 }];
      setZones(newZones);
      syncToParent(newZones, mode);
    }
  };

  const removeZone = (index: number) => {
    if (zones.length > 1) {
      const newZones = zones.filter((_, i) => i !== index);
      setZones(newZones);
      syncToParent(newZones, mode);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto" data-onboarding-scroll>
        <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-lg font-bold text-app-text mb-1">{t('tablesTitle')}</h1>
            <p className="text-app-text-secondary text-sm">{t('tablesSubtitle')}</p>
          </div>

          {/* Mode Selector */}
          <ModeSelector mode={mode} onModeChange={handleModeChange} />

          {/* Mode: Skip */}
          {mode === 'skip' && <SkipState />}

          {/* Mode: Minimum */}
          {mode === 'minimum' && (
            <MinimumZones
              zones={zones}
              updateZone={updateZone}
              addZone={addZone}
              removeZone={removeZone}
            />
          )}

          {/* Mode: Complete */}
          {mode === 'complete' && (
            <CompleteZones
              zones={zones}
              updateZone={updateZone}
              addZone={addZone}
              removeZone={removeZone}
            />
          )}

          {/* Naming hint */}
          {mode !== 'skip' && (
            <div className="mt-8 p-4 rounded-xl bg-accent/5 border border-accent/20">
              <p className="text-xs text-app-text-secondary">
                <span className="font-semibold text-accent">{t('tipPrefix')}</span>{' '}
                {zones[0]?.prefix || 'XXX'}-1, {zones[0]?.prefix || 'XXX'}-2, ...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
