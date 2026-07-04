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
      <p className="mb-2 block text-xs font-medium text-app-text-secondary">{t('zonesLabel')}</p>
      <div className="space-y-3">
        {zones.map((zone, index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded-xl border border-app-border bg-app-elevated p-3 shadow-sm"
          >
            <div className="flex-1">
              <Input
                type="text"
                placeholder={t('zoneNamePlaceholder')}
                value={zone.name}
                onChange={(e) => updateZone(index, 'name', e.target.value)}
                className="h-10 rounded-lg border-app-border bg-app-elevated px-3.5 text-sm shadow-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15"
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
                className="h-10 rounded-lg border-app-border bg-app-elevated px-3.5 text-center text-sm shadow-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeZone(index)}
              disabled={zones.length === 1}
              className={`h-10 w-10 min-h-[44px] min-w-[44px] rounded-lg p-2.5 transition-colors ${
                zones.length === 1
                  ? 'cursor-not-allowed text-app-text-muted'
                  : 'text-app-text-muted hover:bg-status-error-bg hover:text-status-error'
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
            className="flex h-auto w-full items-center gap-2 rounded-lg border border-dashed border-app-border px-4 py-3 text-sm font-medium text-app-text-secondary transition-colors hover:border-app-border-hover hover:text-app-text"
          >
            <Plus className="h-4 w-4" />
            {t('addZone')}
          </Button>
        )}

        {/* Preview */}
        {zones.some((z) => z.name && z.tableCount > 0) && (
          <div className="mt-6 rounded-xl border border-app-border bg-app-elevated p-4 shadow-sm">
            <p className="mb-3 text-xs font-semibold text-app-text-muted">{t('tipPrefix')}</p>
            <div className="flex flex-wrap gap-2">
              {zones
                .filter((z) => z.name)
                .map((zone) => {
                  const prefix = zone.prefix || derivePrefix(zone.name);
                  const count = Math.min(zone.tableCount, 6);
                  return Array.from({ length: count }, (_, i) => (
                    <span
                      key={`${prefix}-${i}`}
                      className="rounded-lg border border-app-border bg-app-card px-2.5 py-1 font-mono text-xs text-app-text-secondary"
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
