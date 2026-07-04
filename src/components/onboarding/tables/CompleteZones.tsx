'use client';

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
import { Plus, X } from 'lucide-react';
import { capacityOptions, type ZoneData } from './types';

interface CompleteZonesProps {
  zones: ZoneData[];
  updateZone: (index: number, field: keyof ZoneData, value: string | number) => void;
  addZone: () => void;
  removeZone: (index: number) => void;
}

export function CompleteZones({ zones, updateZone, addZone, removeZone }: CompleteZonesProps) {
  const t = useTranslations('onboarding');

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-widest text-app-text-muted mb-4">
        {t('zonesLabel')}
      </p>
      <div className="space-y-4">
        {zones.map((zone, index) => (
          <div
            key={index}
            className="rounded-xl border border-app-border bg-app-elevated overflow-hidden"
          >
            {/* Zone header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-app-border">
              <span className="text-xs font-bold text-app-text-muted uppercase tracking-wider">
                {t('zoneNumber', { number: index + 1 })}
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
                    : 'text-app-text-muted hover:text-status-error hover:bg-status-error-bg'
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
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={zone.tableCount}
                    onChange={(e) => updateZone(index, 'tableCount', e.target.value)}
                    className="h-10 bg-app-bg rounded-xl border-app-border text-sm"
                  />
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
  );
}
