'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { Zone, Table } from '@/types/admin.types';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface TablePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (table: Table) => void;
  zones: Zone[];
  tables: Table[];
}

export default function TablePicker({
  isOpen,
  onClose,
  onSelect,
  zones,
  tables,
}: TablePickerProps) {
  const t = useTranslations('tenant');
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);

  // Filter tables by zone
  const availableTables = useMemo(() => {
    if (!selectedZone) return [];
    return tables
      .filter((t) => t.zone_id === selectedZone.id)
      .sort((a, b) => a.table_number.localeCompare(b.table_number, undefined, { numeric: true }));
  }, [selectedZone, tables]);

  // Initialize with first zone
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isOpen && zones.length > 0 && !selectedZone) {
      setSelectedZone(zones[0]);
    }
  }, [isOpen, zones, selectedZone]);

  // Reset table when zone changes
  useEffect(() => {
    setSelectedTable(null);
  }, [selectedZone]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleConfirm = () => {
    if (selectedTable) {
      onSelect(selectedTable);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-app-bg gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>{t('selectYourTable')}</DialogTitle>
        </DialogHeader>

        <div className="p-6">
          <div className="flex gap-4 h-64">
            {/* Zone Column */}
            <div className="flex-1 flex flex-col">
              <Label className="text-[13px] font-bold mb-2 text-center text-app-text-secondary">
                {t('zone')}
              </Label>
              <div className="flex-1 overflow-y-auto pr-1 space-y-1">
                {zones.map((zone) => (
                  <Button
                    key={zone.id}
                    variant="ghost"
                    onClick={() => setSelectedZone(zone)}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-lg text-sm h-auto justify-start',
                      selectedZone?.id === zone.id
                        ? 'text-white font-normal bg-app-text'
                        : 'text-app-text-secondary hover:bg-app-elevated',
                    )}
                  >
                    {zone.name}
                  </Button>
                ))}
                {zones.length === 0 && (
                  <p className="text-xs text-center py-4 text-app-text-muted">{t('noZone')}</p>
                )}
              </div>
            </div>

            <div className="w-px bg-app-border my-2"></div>

            {/* Table Column */}
            <div className="flex-1 flex flex-col">
              <Label className="text-[13px] font-bold mb-2 text-center text-app-text-secondary">
                {t('table')}
              </Label>
              <div className="flex-1 overflow-y-auto pl-1 space-y-1">
                {availableTables.map((table) => (
                  <Button
                    key={table.id}
                    variant="ghost"
                    onClick={() => setSelectedTable(table)}
                    className={cn(
                      'w-full text-center px-3 py-2 rounded-lg text-sm h-auto',
                      selectedTable?.id === table.id
                        ? 'text-white font-bold bg-app-text'
                        : 'text-app-text-secondary hover:bg-app-elevated',
                    )}
                  >
                    {table.table_number}
                  </Button>
                ))}
                {selectedZone && availableTables.length === 0 && (
                  <p className="text-xs text-center py-4 text-app-text-muted">{t('noTable')}</p>
                )}
                {!selectedZone && (
                  <p className="text-xs text-center py-4 text-app-text-muted">{t('selectZone')}</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <Button
              className={cn(
                'w-full text-base text-white rounded-[10px] h-[52px]',
                selectedTable && 'bg-app-text',
              )}
              onClick={handleConfirm}
              disabled={!selectedTable}
            >
              {t('confirmTable', { number: selectedTable?.table_number ?? '' })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
