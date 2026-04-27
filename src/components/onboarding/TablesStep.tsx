'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus, Minus, X, Clock } from 'lucide-react';
import type { OnboardingData } from '@/app/onboarding/page';

interface TablesStepProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
}

interface ZoneData {
  name: string;
  prefix: string;
  tableCount: number;
  defaultCapacity?: number;
}

type ConfigMode = 'complete' | 'minimum' | 'skip';

const capacityOptions = [2, 4, 6, 8, 10, 12];

/** Derive a prefix from a zone name: first 3 uppercase letters. */
function derivePrefix(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 3)
    .toUpperCase();
}

const modeIds: ConfigMode[] = ['complete', 'minimum', 'skip'];

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

  const modeLabelKeys: Record<ConfigMode, string> = {
    complete: 'modeComplete',
    minimum: 'modeMinimum',
    skip: 'modeSkip',
  };

  const modeDescKeys: Record<ConfigMode, string> = {
    complete: 'modeCompleteDesc',
    minimum: 'modeMinimumDesc',
    skip: 'modeSkipDesc',
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
          <div className="mb-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-app-text-muted mb-4">
              Mode de configuration
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {modeIds.map((id) => {
                const isActive = mode === id;
                return (
                  <Button
                    key={id}
                    type="button"
                    variant="outline"
                    onClick={() => handleModeChange(id)}
                    className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all duration-200 h-auto whitespace-normal ${
                      isActive
                        ? 'border-accent bg-accent/10'
                        : 'border-app-border hover:border-app-border-hover bg-app-elevated/30 hover:bg-app-elevated/60'
                    }`}
                  >
                    <p
                      className={`font-semibold text-sm ${isActive ? 'text-app-text' : 'text-app-text-secondary'}`}
                    >
                      {t(modeLabelKeys[id])}
                    </p>
                    <p className="text-xs text-app-text-muted mt-0.5 leading-relaxed">
                      {t(modeDescKeys[id])}
                    </p>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Mode: Skip */}
          {mode === 'skip' && (
            <div className="rounded-xl border border-dashed border-app-border p-8 text-center">
              <Clock className="h-10 w-10 text-app-text-muted mx-auto mb-3" />
              <p className="text-base text-app-text-secondary font-medium">{t('skipInfo')}</p>
            </div>
          )}

          {/* Mode: Minimum */}
          {mode === 'minimum' && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-app-text-muted mb-4">
                Zones
              </p>
              <div className="space-y-3">
                {zones.map((zone, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 rounded-xl bg-app-elevated/40 border border-app-border"
                  >
                    <div className="flex-1">
                      <Input
                        type="text"
                        placeholder={t('zoneNamePlaceholder')}
                        value={zone.name}
                        onChange={(e) => updateZone(index, 'name', e.target.value)}
                        className="h-11 bg-app-bg rounded-xl border-app-border text-sm"
                      />
                    </div>
                    <div className="inline-flex items-center h-11 rounded-xl border border-app-border bg-app-elevated overflow-hidden shrink-0 focus-within:ring-2 focus-within:ring-accent/30 focus-within:ring-offset-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        aria-label="Decrease"
                        onClick={() =>
                          updateZone(index, 'tableCount', Math.max(1, zone.tableCount - 1))
                        }
                        disabled={zone.tableCount <= 1}
                        className="h-full w-10 rounded-none border-r border-app-border hover:bg-app-border/30 disabled:opacity-30 disabled:cursor-not-allowed shrink-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                      >
                        <Minus className="h-3.5 w-3.5 text-app-text-secondary" />
                      </Button>
                      <span className="w-12 text-center font-semibold text-sm text-app-text tabular-nums select-none">
                        {zone.tableCount}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        aria-label="Increase"
                        onClick={() =>
                          updateZone(index, 'tableCount', Math.min(100, zone.tableCount + 1))
                        }
                        disabled={zone.tableCount >= 100}
                        className="h-full w-10 rounded-none border-l border-app-border hover:bg-app-border/30 disabled:opacity-30 disabled:cursor-not-allowed shrink-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                      >
                        <Plus className="h-3.5 w-3.5 text-app-text-secondary" />
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeZone(index)}
                      disabled={zones.length === 1}
                      className={`p-2.5 rounded-xl transition-colors h-10 w-10 ${
                        zones.length === 1
                          ? 'text-app-text-muted cursor-not-allowed'
                          : 'text-app-text-muted hover:text-red-500 hover:bg-red-500/10'
                      }`}
                      aria-label={t('deleteZone')}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                {zones.length < 20 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addZone}
                    className="flex items-center gap-2 px-4 py-3 w-full rounded-xl border border-dashed border-app-border text-app-text-secondary hover:border-accent/40 hover:text-app-text transition-colors text-sm font-medium h-auto"
                  >
                    <Plus className="h-4 w-4" />
                    {t('addZone')}
                  </Button>
                )}

                {/* Preview */}
                {zones.some((z) => z.name && z.tableCount > 0) && (
                  <div className="mt-6 p-4 rounded-xl bg-app-elevated/40 border border-app-border">
                    <p className="text-xs font-semibold text-app-text-muted mb-3">
                      {t('tipPrefix')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {zones
                        .filter((z) => z.name)
                        .map((zone) => {
                          const prefix = zone.prefix || derivePrefix(zone.name);
                          const count = Math.min(zone.tableCount, 6);
                          return Array.from({ length: count }, (_, i) => (
                            <span
                              key={`${prefix}-${i}`}
                              className="font-mono bg-app-bg rounded-lg px-2.5 py-1 text-xs text-app-text-secondary border border-app-border"
                            >
                              {prefix}-{i + 1}
                            </span>
                          ));
                        })}
                      {zones.some((z) => z.tableCount > 6) && (
                        <span className="inline-flex items-center px-2.5 py-1 text-xs text-app-text-muted">
                          ...
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mode: Complete */}
          {mode === 'complete' && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-app-text-muted mb-4">
                Zones
              </p>
              <div className="space-y-4">
                {zones.map((zone, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-app-border bg-app-elevated/30 overflow-hidden"
                  >
                    {/* Zone header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-app-border">
                      <span className="text-xs font-bold text-app-text-muted uppercase tracking-wider">
                        Zone {index + 1}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeZone(index)}
                        disabled={zones.length === 1}
                        className={`p-1.5 rounded-lg transition-colors h-7 w-7 ${
                          zones.length === 1
                            ? 'text-app-text-muted cursor-not-allowed'
                            : 'text-app-text-muted hover:text-red-500 hover:bg-red-500/10'
                        }`}
                        aria-label={t('deleteZone')}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Zone fields */}
                    <div className="p-4">
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <Label className="text-app-text-secondary text-xs mb-1.5 block">
                            {t('zoneName')}
                          </Label>
                          <Input
                            type="text"
                            placeholder={t('zoneNamePlaceholder')}
                            value={zone.name}
                            onChange={(e) => updateZone(index, 'name', e.target.value)}
                            className="h-10 bg-app-bg rounded-xl border-app-border text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-app-text-secondary text-xs mb-1.5 block">
                            {t('zonePrefix')}
                          </Label>
                          <Input
                            type="text"
                            placeholder="TER"
                            maxLength={5}
                            value={zone.prefix}
                            onChange={(e) => updateZone(index, 'prefix', e.target.value)}
                            className="h-10 bg-app-bg rounded-xl border-app-border font-mono uppercase text-sm"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-app-text-secondary text-xs mb-1.5 block">
                            {t('zoneTableCount')}
                          </Label>
                          <div className="flex items-center h-10 rounded-xl border border-app-border bg-app-elevated overflow-hidden w-full focus-within:ring-2 focus-within:ring-accent/30 focus-within:ring-offset-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              aria-label="Decrease"
                              onClick={() =>
                                updateZone(index, 'tableCount', Math.max(1, zone.tableCount - 1))
                              }
                              disabled={zone.tableCount <= 1}
                              className="h-full w-10 rounded-none border-r border-app-border hover:bg-app-border/30 disabled:opacity-30 disabled:cursor-not-allowed shrink-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                            >
                              <Minus className="h-3.5 w-3.5 text-app-text-secondary" />
                            </Button>
                            <span className="flex-1 text-center font-semibold text-sm text-app-text tabular-nums select-none">
                              {zone.tableCount}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              aria-label="Increase"
                              onClick={() =>
                                updateZone(index, 'tableCount', Math.min(100, zone.tableCount + 1))
                              }
                              disabled={zone.tableCount >= 100}
                              className="h-full w-10 rounded-none border-l border-app-border hover:bg-app-border/30 disabled:opacity-30 disabled:cursor-not-allowed shrink-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                            >
                              <Plus className="h-3.5 w-3.5 text-app-text-secondary" />
                            </Button>
                          </div>
                        </div>
                        <div>
                          <Label className="text-app-text-secondary text-xs mb-1.5 block">
                            {t('zoneCapacity')}
                          </Label>
                          <Select
                            value={String(zone.defaultCapacity ?? 2)}
                            onValueChange={(val) => updateZone(index, 'defaultCapacity', val)}
                          >
                            <SelectTrigger className="h-10 bg-app-bg rounded-xl border-app-border text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {capacityOptions.map((cap) => (
                                <SelectItem key={cap} value={String(cap)}>
                                  {cap} {t('capacityPlaces')}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Inline preview for this zone */}
                      {zone.name && zone.prefix && zone.tableCount > 0 && (
                        <div className="mt-4 pt-3 border-t border-app-border">
                          <div className="flex flex-wrap gap-1.5">
                            {Array.from({ length: Math.min(zone.tableCount, 8) }, (_, i) => (
                              <span
                                key={i}
                                className="font-mono bg-app-bg rounded-lg px-2 py-0.5 text-xs text-app-text-secondary border border-app-border"
                              >
                                {zone.prefix}-{i + 1}
                              </span>
                            ))}
                            {zone.tableCount > 8 && (
                              <span className="inline-flex items-center px-2 py-0.5 text-xs text-app-text-muted">
                                ...+{zone.tableCount - 8}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {zones.length < 20 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addZone}
                    className="flex items-center gap-2 px-4 py-3 w-full rounded-xl border border-dashed border-app-border text-app-text-secondary hover:border-accent/40 hover:text-app-text transition-colors text-sm font-medium h-auto"
                  >
                    <Plus className="h-4 w-4" />
                    {t('addZone')}
                  </Button>
                )}
              </div>
            </div>
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
