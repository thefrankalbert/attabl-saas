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
      <p className="mb-2 block text-xs font-medium text-app-text-secondary">{t('zonesLabel')}</p>
      <div className="space-y-4">
        {zones.map((zone, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-xl border border-app-border bg-app-elevated shadow-sm"
          >
            {/* Zone header */}
            <div className="flex items-center justify-between border-b border-app-border px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-app-text-muted">
                {t('zoneNumber', { number: index + 1 })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeZone(index)}
                disabled={zones.length === 1}
                className={`h-7 w-7 rounded-lg p-1.5 transition-colors ${
                  zones.length === 1
                    ? 'cursor-not-allowed text-app-text-muted'
                    : 'text-app-text-muted hover:bg-status-error-bg hover:text-status-error'
                }`}
                aria-label={t('deleteZone')}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Zone fields */}
            <div className="p-4">
              <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block text-xs font-medium text-app-text-secondary">
                    {t('zoneName')}
                  </Label>
                  <Input
                    type="text"
                    placeholder={t('zoneNamePlaceholder')}
                    value={zone.name}
                    onChange={(e) => updateZone(index, 'name', e.target.value)}
                    className="h-10 rounded-lg border-app-border bg-app-elevated px-3.5 text-base md:text-sm shadow-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15"
                  />
                </div>
                <div>
                  <Label className="mb-2 block text-xs font-medium text-app-text-secondary">
                    {t('zonePrefix')}
                  </Label>
                  <Input
                    type="text"
                    placeholder="TER"
                    maxLength={5}
                    value={zone.prefix}
                    onChange={(e) => updateZone(index, 'prefix', e.target.value)}
                    className="h-10 rounded-lg border-app-border bg-app-elevated px-3.5 font-mono text-base md:text-sm uppercase shadow-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block text-xs font-medium text-app-text-secondary">
                    {t('zoneTableCount')}
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={zone.tableCount}
                    onChange={(e) => updateZone(index, 'tableCount', e.target.value)}
                    className="h-10 rounded-lg border-app-border bg-app-elevated px-3.5 text-base md:text-sm shadow-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15"
                  />
                </div>
                <div>
                  <Label className="mb-2 block text-xs font-medium text-app-text-secondary">
                    {t('zoneCapacity')}
                  </Label>
                  <Select
                    value={String(zone.defaultCapacity ?? 2)}
                    onValueChange={(val) => updateZone(index, 'defaultCapacity', val)}
                  >
                    <SelectTrigger className="h-10 rounded-lg border-app-border bg-app-elevated px-3.5 text-sm shadow-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15">
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
                <div className="mt-4 border-t border-app-border pt-3">
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: Math.min(zone.tableCount, 8) }, (_, i) => (
                      <span
                        key={i}
                        className="rounded-lg border border-app-border bg-app-card px-2 py-0.5 font-mono text-xs text-app-text-secondary"
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
            className="flex h-auto w-full items-center gap-2 rounded-lg border border-dashed border-app-border px-4 py-3 text-sm font-medium text-app-text-secondary transition-colors hover:border-app-border-hover hover:text-app-text"
          >
            <Plus className="h-4 w-4" />
            {t('addZone')}
          </Button>
        )}
      </div>
    </div>
  );
}
