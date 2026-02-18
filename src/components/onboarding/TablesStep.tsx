'use client';

import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Grid3x3, Plus, X, Zap, Settings, Clock } from 'lucide-react';
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

const modeOptions: Array<{
  id: ConfigMode;
  label: string;
  description: string;
  icon: typeof Settings;
}> = [
  {
    id: 'complete',
    label: 'Configuration complète',
    description: 'Zones, préfixes, capacité',
    icon: Settings,
  },
  {
    id: 'minimum',
    label: 'Configuration rapide',
    description: 'Nom de zone + nombre de tables',
    icon: Zap,
  },
  {
    id: 'skip',
    label: 'Configurer plus tard',
    description: '10 tables par défaut',
    icon: Clock,
  },
];

export function TablesStep({ data, updateData }: TablesStepProps) {
  const [mode, setMode] = useState<ConfigMode>(data.tableConfigMode || 'skip');
  const [zones, setZones] = useState<ZoneData[]>(
    data.tableZones && data.tableZones.length > 0
      ? data.tableZones
      : [{ name: 'Salle principale', prefix: 'SAL', tableCount: 10, defaultCapacity: 2 }],
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
    <div>
      {/* Header */}
      <div className="mb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/5 text-neutral-600 text-sm font-medium mb-2">
          <Grid3x3 className="h-3.5 w-3.5" />
          Étape 2/5
        </div>
        <h1 className="text-2xl font-bold text-neutral-900 mb-1">Configurez vos tables</h1>
        <p className="text-neutral-500 text-sm">
          Organisez vos tables par zone pour faciliter la gestion des commandes.
        </p>
      </div>

      {/* Mode Selector */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {modeOptions.map((opt) => {
          const isActive = mode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleModeChange(opt.id)}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                isActive
                  ? 'border-neutral-900 bg-neutral-900/5'
                  : 'border-neutral-200 hover:border-neutral-300'
              }`}
            >
              <opt.icon
                className={`h-4 w-4 mb-1.5 ${isActive ? 'text-neutral-900' : 'text-neutral-400'}`}
              />
              <p className="font-medium text-neutral-900 text-xs leading-tight">{opt.label}</p>
              <p className="text-[10px] text-neutral-500 mt-0.5">{opt.description}</p>
            </button>
          );
        })}
      </div>

      {/* Mode: Skip */}
      {mode === 'skip' && (
        <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100 text-center">
          <Clock className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
          <p className="text-sm text-neutral-600 font-medium">
            Nous configurerons automatiquement 10 tables pour vous.
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            Vous pourrez personnaliser vos zones et tables depuis le Dashboard.
          </p>
        </div>
      )}

      {/* Mode: Minimum */}
      {mode === 'minimum' && (
        <div className="space-y-2.5">
          <Label className="text-neutral-700 font-semibold text-sm">Zones</Label>
          {zones.map((zone, index) => (
            <div key={index} className="flex items-center gap-2">
              <div className="flex-1">
                <Input
                  type="text"
                  placeholder="Nom de la zone (ex: Terrasse)"
                  value={zone.name}
                  onChange={(e) => updateZone(index, 'name', e.target.value)}
                  className="h-10 bg-neutral-50 border-neutral-200 focus:bg-white focus:border-neutral-900 rounded-xl text-sm"
                />
              </div>
              <div className="w-24">
                <Input
                  type="number"
                  min="1"
                  max="100"
                  placeholder="Tables"
                  value={zone.tableCount}
                  onChange={(e) => updateZone(index, 'tableCount', e.target.value)}
                  className="h-10 bg-neutral-50 border-neutral-200 focus:bg-white focus:border-neutral-900 rounded-xl text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => removeZone(index)}
                disabled={zones.length === 1}
                className={`p-2 rounded-lg transition-colors ${
                  zones.length === 1
                    ? 'text-neutral-300 cursor-not-allowed'
                    : 'text-neutral-400 hover:text-red-500 hover:bg-red-50'
                }`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}

          {zones.length < 20 && (
            <button
              type="button"
              onClick={addZone}
              className="flex items-center gap-2 px-3 py-2.5 w-full rounded-xl border-2 border-dashed border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 transition-colors text-sm"
            >
              <Plus className="h-4 w-4" />
              Ajouter une zone
            </button>
          )}

          {/* Preview */}
          {zones.some((z) => z.name && z.tableCount > 0) && (
            <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-100 mt-3">
              <p className="text-xs text-neutral-500 mb-2">Aperçu des tables</p>
              <div className="flex flex-wrap gap-1.5">
                {zones
                  .filter((z) => z.name)
                  .map((zone) => {
                    const prefix = zone.prefix || derivePrefix(zone.name);
                    const count = Math.min(zone.tableCount, 6);
                    return Array.from({ length: count }, (_, i) => (
                      <span
                        key={`${prefix}-${i}`}
                        className="inline-flex items-center px-2 py-0.5 rounded-md bg-white border border-neutral-200 text-xs font-mono text-neutral-600"
                      >
                        {prefix}-{i + 1}
                      </span>
                    ));
                  })}
                {zones.some((z) => z.tableCount > 6) && (
                  <span className="inline-flex items-center px-2 py-0.5 text-xs text-neutral-400">
                    ...
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mode: Complete */}
      {mode === 'complete' && (
        <div className="space-y-3">
          {zones.map((zone, index) => (
            <div key={index} className="p-3 rounded-xl border border-neutral-200 bg-white">
              <div className="flex items-start justify-between mb-2.5">
                <span className="text-xs font-medium text-neutral-400">Zone {index + 1}</span>
                <button
                  type="button"
                  onClick={() => removeZone(index)}
                  disabled={zones.length === 1}
                  className={`p-1 rounded-lg transition-colors ${
                    zones.length === 1
                      ? 'text-neutral-300 cursor-not-allowed'
                      : 'text-neutral-400 hover:text-red-500 hover:bg-red-50'
                  }`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <Label className="text-neutral-600 text-xs">Nom</Label>
                  <Input
                    type="text"
                    placeholder="Terrasse"
                    value={zone.name}
                    onChange={(e) => updateZone(index, 'name', e.target.value)}
                    className="mt-1 h-9 bg-neutral-50 border-neutral-200 focus:bg-white focus:border-neutral-900 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <Label className="text-neutral-600 text-xs">Préfixe</Label>
                  <Input
                    type="text"
                    placeholder="TER"
                    maxLength={5}
                    value={zone.prefix}
                    onChange={(e) => updateZone(index, 'prefix', e.target.value)}
                    className="mt-1 h-9 bg-neutral-50 border-neutral-200 focus:bg-white focus:border-neutral-900 rounded-xl font-mono uppercase text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-neutral-600 text-xs">Nombre de tables</Label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={zone.tableCount}
                    onChange={(e) => updateZone(index, 'tableCount', e.target.value)}
                    className="mt-1 h-9 bg-neutral-50 border-neutral-200 focus:bg-white focus:border-neutral-900 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <Label className="text-neutral-600 text-xs">Capacité par table</Label>
                  <select
                    value={zone.defaultCapacity ?? 2}
                    onChange={(e) => updateZone(index, 'defaultCapacity', e.target.value)}
                    className="mt-1 h-9 w-full px-3 bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-neutral-900 rounded-xl text-sm"
                  >
                    {capacityOptions.map((cap) => (
                      <option key={cap} value={cap}>
                        {cap} places
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Inline preview for this zone */}
              {zone.name && zone.prefix && zone.tableCount > 0 && (
                <div className="mt-2 pt-2 border-t border-neutral-100">
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: Math.min(zone.tableCount, 8) }, (_, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center px-1.5 py-0.5 rounded bg-neutral-100 text-[10px] font-mono text-neutral-500"
                      >
                        {zone.prefix}-{i + 1}
                      </span>
                    ))}
                    {zone.tableCount > 8 && (
                      <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] text-neutral-400">
                        ...+{zone.tableCount - 8}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {zones.length < 20 && (
            <button
              type="button"
              onClick={addZone}
              className="flex items-center gap-2 px-3 py-2.5 w-full rounded-xl border-2 border-dashed border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 transition-colors text-sm"
            >
              <Plus className="h-4 w-4" />
              Ajouter une zone
            </button>
          )}
        </div>
      )}

      {/* Tip */}
      {mode !== 'skip' && (
        <div className="mt-4 p-3 rounded-xl bg-neutral-50 border border-neutral-100">
          <p className="text-xs text-neutral-600">
            <strong>Astuce :</strong> Le préfixe est automatiquement déduit du nom de la zone. Les
            tables seront numérotées {zones[0]?.prefix || 'XXX'}-1, {zones[0]?.prefix || 'XXX'}-2,
            etc.
          </p>
        </div>
      )}
    </div>
  );
}
