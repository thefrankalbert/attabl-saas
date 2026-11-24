'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import type { ZoneIssue } from '@/lib/validations/onboarding.schema';
import type { ZoneData } from './types';

interface MinimumZonesProps {
  zones: ZoneData[];
  /** Prefixes reellement envoyes en mode rapide (tous automatiques), pour l'apercu. */
  previewPrefixes: string[];
  /** Doublons et prefixes invalides, signales sous le champ de la zone. */
  issues: ZoneIssue[];
  updateZone: (index: number, field: keyof ZoneData, value: string | number) => void;
  addZone: () => void;
  removeZone: (index: number) => void;
}

export function MinimumZones({
  zones,
  previewPrefixes,
  issues,
  updateZone,
  addZone,
  removeZone,
}: MinimumZonesProps) {
  const t = useTranslations('onboarding');

  return (
    <div>
      <p className="mb-2 block text-xs font-medium text-app-text-secondary">{t('zonesLabel')}</p>
      <div className="space-y-3">
        {zones.map((zone, index) => (
          <div
            key={index}
            className="flex items-start gap-3 rounded-xl border border-app-border bg-app-elevated p-3 shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <Input
                type="text"
                placeholder={t('zoneNamePlaceholder')}
                value={zone.name}
                onChange={(e) => updateZone(index, 'name', e.target.value)}
                aria-invalid={issues.some((i) => i.index === index) || undefined}
                aria-describedby={
                  issues.some((i) => i.index === index) ? `zone-${index}-issue` : undefined
                }
                className="h-10 rounded-lg border-app-border bg-app-elevated px-3.5 text-base md:text-sm shadow-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15"
              />
              {issues
                .filter((i) => i.index === index)
                .slice(0, 1)
                .map((issue) => (
                  <p
                    key={issue.code}
                    id={`zone-${index}-issue`}
                    className="mt-1 text-xs text-status-error"
                  >
                    {t(`zoneFieldIssue.${issue.code}`)}
                  </p>
                ))}
            </div>
            <div className="w-28">
              <Input
                type="number"
                min="1"
                max="100"
                placeholder={t('zoneTableCount')}
                value={zone.tableCount}
                onChange={(e) => updateZone(index, 'tableCount', e.target.value)}
                className="h-10 rounded-lg border-app-border bg-app-elevated px-3.5 text-center text-base md:text-sm shadow-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15"
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
            <p className="mb-3 text-xs font-semibold text-app-text-secondary">{t('tipPrefix')}</p>
            <div className="flex flex-wrap gap-2">
              {zones
                .map((zone, index) => ({ zone, prefix: previewPrefixes[index] ?? zone.prefix }))
                .filter(({ zone }) => zone.name)
                .map(({ zone, prefix }) => {
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
                <span className="inline-flex items-center px-2.5 py-1 text-xs text-app-text-secondary">
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
