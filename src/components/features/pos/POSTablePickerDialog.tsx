'use client';

import { LayoutGrid, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { Zone, Table } from '@/types/admin.types';

interface POSTablePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zones: Zone[];
  pickerZoneId: string | null;
  onPickZone: (zoneId: string) => void;
  pickerTables: Table[];
  selectedTable: string;
  onSelectTable: (tableNumber: string) => void;
}

export function POSTablePickerDialog({
  open,
  onOpenChange,
  zones,
  pickerZoneId,
  onPickZone,
  pickerTables,
  selectedTable,
  onSelectTable,
}: POSTablePickerDialogProps) {
  const t = useTranslations('pos');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0">
        <DialogHeader className="px-6 py-4 border-b border-app-border">
          <DialogTitle>{t('selectTable')}</DialogTitle>
        </DialogHeader>

        <div className="p-4">
          {zones.length > 0 ? (
            <div className="flex gap-4 h-72">
              {/* Zone Column */}
              <div className="w-36 flex flex-col shrink-0">
                <Label className="text-xs font-semibold text-app-text-muted uppercase tracking-wider mb-2 text-center">
                  {t('zone')}
                </Label>
                <div className="flex-1 overflow-y-auto space-y-1">
                  {zones.map((zone) => (
                    <Button
                      key={zone.id}
                      type="button"
                      variant={pickerZoneId === zone.id ? 'default' : 'ghost'}
                      onClick={() => onPickZone(zone.id)}
                      className={cn(
                        'w-full justify-start px-3 py-2 rounded-lg text-sm flex items-center gap-2 h-auto',
                        pickerZoneId === zone.id
                          ? 'bg-accent text-accent-text font-medium'
                          : 'text-app-text-secondary hover:bg-app-hover',
                      )}
                    >
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{zone.name}</span>
                    </Button>
                  ))}
                </div>
              </div>

              <div className="w-px bg-app-border my-2" />

              {/* Tables Grid */}
              <div className="flex-1 flex flex-col min-w-0">
                <Label className="text-xs font-semibold text-app-text-muted uppercase tracking-wider mb-2 text-center">
                  {t('tables')}
                </Label>
                <div className="flex-1 overflow-y-auto">
                  {pickerTables.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {pickerTables.map((table) => (
                        <Button
                          key={table.id}
                          type="button"
                          variant={selectedTable === table.table_number ? 'default' : 'outline'}
                          onClick={() => onSelectTable(table.table_number)}
                          className={cn(
                            'flex flex-col items-center justify-center rounded-lg px-2 py-3 text-sm min-h-[56px] h-auto',
                            selectedTable === table.table_number
                              ? 'bg-accent text-accent-text border-accent font-bold'
                              : 'border-app-border text-app-text hover:bg-app-hover hover:border-accent/30',
                          )}
                        >
                          <span className="font-semibold text-xs">{table.table_number}</span>
                          {table.display_name !== table.table_number && (
                            <span className="text-[10px] opacity-70 truncate max-w-full">
                              {table.display_name}
                            </span>
                          )}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-app-text-muted text-sm">
                      {pickerZoneId ? t('noTablesInZone') : t('selectTable')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-app-text-muted">
              <LayoutGrid className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">{t('noZonesConfigured')}</p>
              <p className="text-xs mt-1 text-app-text-muted">{t('noZonesHint')}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
