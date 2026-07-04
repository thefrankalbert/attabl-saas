'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { derivePrefix, type ZoneData } from './types';

interface MinimumZonesProps {
  zones: ZoneData[];
  updateZone: (index: number, field: keyof ZoneData, value: string | number) => void;
  addZone: () => void;
  removeZone: (index: number) => void;
}

export function MinimumZones({ zones, updateZone, addZone, removeZone }: MinimumZonesProps) {
  const t = useTranslations('onboarding');

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-widest text-app-text-muted mb-4">
        {t('zonesLabel')}
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
            <div className="w-28">
              <Input
                type="number"
                min="1"
                max="100"
                placeholder={t('zoneTableCount')}
                value={zone.tableCount}
                onChange={(e) => updateZone(index, 'tableCount', e.target.value)}
                className="h-11 bg-app-bg rounded-xl border-app-border text-sm text-center"
              />
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
                  : 'text-app-text-muted hover:text-status-error hover:bg-status-error-bg'
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
            <p className="text-xs font-semibold text-app-text-muted mb-3">{t('tipPrefix')}</p>
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
  );
}
