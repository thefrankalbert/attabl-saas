'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { OnboardingData } from '@/app/onboarding/page';
import {
  MAX_TABLES_PER_ZONE,
  withUniquePrefixes,
  zonesForDraft,
  type ConfigMode,
  type ZoneData,
} from './tables/types';
import { findZoneIssues, type ZoneIssue } from '@/lib/validations/onboarding.schema';
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
      : // La premiere zone reprend le nombre de tables deja donne a l'ecran
        // Adresse: la meme question ne doit pas recevoir deux reponses.
        [
          {
            name: '',
            prefix: '',
            tableCount: Math.min(MAX_TABLES_PER_ZONE, Math.max(1, data.tableCount || 10)),
            defaultCapacity: 2,
          },
        ],
  );

  const defaultName = useCallback((number: number) => t('zoneDefaultName', { number }), [t]);

  const syncToParent = useCallback(
    (newZones: ZoneData[], newMode: ConfigMode) => {
      updateData({
        tableConfigMode: newMode,
        // B28: chaque zone transmise porte un prefixe utilisable et unique, et
        // un nom (par defaut "Salle n", le premier libre).
        tableZones: zonesForDraft(newZones, newMode, defaultName),
      });
    },
    [updateData, defaultName],
  );

  // Contre-audit 3: les doublons (prefixe ou nom) se voient DES cette etape,
  // sous le champ concerne, avec la regle exacte du lancement.
  const draftZones = zonesForDraft(zones, mode, defaultName);
  const issues: ZoneIssue[] = mode === 'skip' ? [] : findZoneIssues(draftZones);

  // Prefixes recalcules a chaque changement: les automatiques suivent les noms
  // et les prefixes saisis du moment. Contre-audit 4: l'etat LOCAL garde les
  // prefixes saisis (un aller-retour par le mode rapide les retrouve); seul le
  // brouillon envoye en mode rapide les recalcule tous (syncToParent).
  const apply = (updated: ZoneData[], newMode: ConfigMode) => {
    const next = withUniquePrefixes(updated, 'complete');
    setZones(next);
    syncToParent(next, newMode);
  };

  const handleModeChange = (newMode: ConfigMode) => {
    setMode(newMode);
    apply(zones, newMode);
  };

  const updateZone = (index: number, field: keyof ZoneData, value: string | number) => {
    const updated = [...zones];
    if (field === 'name') {
      updated[index] = { ...updated[index], name: value as string };
    } else if (field === 'prefix') {
      const prefix = (value as string).toUpperCase();
      // Saisi a la main; vide = retour au prefixe automatique.
      updated[index] = { ...updated[index], prefix, prefixManual: prefix !== '' };
    } else if (field === 'tableCount') {
      updated[index] = {
        ...updated[index],
        tableCount: Math.min(MAX_TABLES_PER_ZONE, Math.max(1, Number(value))),
      };
    } else if (field === 'defaultCapacity') {
      updated[index] = { ...updated[index], defaultCapacity: Number(value) };
    }
    apply(updated, mode);
  };

  const addZone = () => {
    if (zones.length < 20) {
      apply([...zones, { name: '', prefix: '', tableCount: 5, defaultCapacity: 2 }], mode);
    }
  };

  const removeZone = (index: number) => {
    if (zones.length > 1) {
      apply(
        zones.filter((_, i) => i !== index),
        mode,
      );
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto" data-onboarding-scroll>
        <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
          <div className="mx-auto w-full max-w-xl">
            {/* Header */}
            <div className="mb-8">
              <h1 className="mb-1.5 text-xl font-semibold tracking-tight text-app-text">
                {t('tablesTitle')}
              </h1>
              <p className="text-sm text-app-text-secondary">{t('tablesSubtitle')}</p>
            </div>

            {/* Mode Selector */}
            <ModeSelector mode={mode} onModeChange={handleModeChange} />

            {/* Mode: Skip */}
            {mode === 'skip' && <SkipState />}

            {/* Mode: Minimum */}
            {mode === 'minimum' && (
              <MinimumZones
                zones={zones}
                previewPrefixes={draftZones.map((z) => z.prefix)}
                issues={issues}
                updateZone={updateZone}
                addZone={addZone}
                removeZone={removeZone}
              />
            )}

            {/* Mode: Complete */}
            {mode === 'complete' && (
              <CompleteZones
                zones={zones}
                issues={issues}
                updateZone={updateZone}
                addZone={addZone}
                removeZone={removeZone}
              />
            )}

            {/* Naming hint */}
            {mode !== 'skip' && (
              <div className="mt-8 rounded-xl border border-app-border bg-app-elevated p-4 shadow-sm">
                <p className="text-xs text-app-text-secondary">
                  <span className="font-semibold text-app-text">{t('tipPrefix')}</span>{' '}
                  {zones[0]?.prefix || 'XXX'}-1, {zones[0]?.prefix || 'XXX'}-2, ...
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
