'use client';

import { Plus, Trash2, Pencil, Check, X, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Zone } from './tables.types';

interface TableZonesPanelProps {
  zones: Zone[];
  selectedZoneId: string | null;
  editingZoneId: string | null;
  editingZoneName: string;
  onSelectZone: (zoneId: string) => void;
  onEditingZoneNameChange: (value: string) => void;
  onSaveZoneName: (zoneId: string) => void;
  onCancelEditZone: () => void;
  onStartEditZone: (zone: Zone) => void;
  onDeleteZone: (zone: Zone) => void;
  onAddZone: () => void;
}

export function TableZonesPanel({
  zones,
  selectedZoneId,
  editingZoneId,
  editingZoneName,
  onSelectZone,
  onEditingZoneNameChange,
  onSaveZoneName,
  onCancelEditZone,
  onStartEditZone,
  onDeleteZone,
  onAddZone,
}: TableZonesPanelProps) {
  const t = useTranslations('tables');

  return (
    <div className="w-full lg:w-72 flex-shrink-0">
      <div className="bg-app-card rounded-xl border border-app-border p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-app-text">{t('zonesHeader')}</h2>
          <span className="text-xs text-app-text-muted">
            {t('zoneCount', { count: zones.length })}
          </span>
        </div>

        <div className="space-y-1.5">
          {zones.map((zone) => (
            <div
              key={zone.id}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2.5 cursor-pointer transition-colors group',
                selectedZoneId === zone.id
                  ? 'bg-app-text/5 border border-app-border'
                  : 'hover:bg-app-bg border border-transparent',
              )}
              onClick={() => {
                if (editingZoneId !== zone.id) {
                  onSelectZone(zone.id);
                }
              }}
            >
              <MapPin
                className={cn(
                  'w-4 h-4 flex-shrink-0',
                  selectedZoneId === zone.id ? 'text-app-text' : 'text-app-text-muted',
                )}
              />

              {editingZoneId === zone.id ? (
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <Input
                    value={editingZoneName}
                    onChange={(e) => onEditingZoneNameChange(e.target.value)}
                    className="h-7 text-base md:text-sm rounded-lg focus:ring-accent"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onSaveZoneName(zone.id);
                      if (e.key === 'Escape') onCancelEditZone();
                    }}
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Confirm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSaveZoneName(zone.id);
                    }}
                    className="h-7 w-7 text-[var(--success)] hover:opacity-90"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Cancel edit"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCancelEditZone();
                    }}
                    className="h-7 w-7 text-app-text-muted hover:text-app-text-secondary"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <>
                  <span
                    className={cn(
                      'text-sm flex-1 min-w-0 break-words',
                      selectedZoneId === zone.id ? 'font-semibold text-app-text' : 'text-app-text',
                    )}
                  >
                    {zone.name}
                  </span>
                  <span className="text-xs text-app-text-muted font-mono">{zone.prefix}</span>
                  <div className="flex items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartEditZone(zone);
                      }}
                      className="h-7 w-7 text-app-text-muted hover:text-app-text-secondary"
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteZone(zone);
                      }}
                      title="Supprimer"
                      className="h-7 w-7 text-[var(--destructive)] hover:opacity-90"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full mt-3 gap-2 text-xs"
          onClick={onAddZone}
        >
          <Plus className="w-3.5 h-3.5" />
          {t('addZone')}
        </Button>
      </div>
    </div>
  );
}
