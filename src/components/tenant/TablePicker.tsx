'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { Zone, Table } from '@/types/admin.types';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  useEffect(() => {
    if (isOpen && zones.length > 0 && !selectedZone) {
      Promise.resolve(zones[0]).then(setSelectedZone);
    }
  }, [isOpen, zones, selectedZone]);

  // Reset table when zone changes
  useEffect(() => {
    Promise.resolve(null).then(setSelectedTable);
  }, [selectedZone]);

  const handleConfirm = () => {
    if (selectedTable) {
      onSelect(selectedTable);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-white gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>{t('selectYourTable')}</DialogTitle>
        </DialogHeader>

        <div className="p-6">
          <div className="flex gap-4 h-64">
            {/* Zone Column */}
            <div className="flex-1 flex flex-col">
              <label
                className="text-[13px] font-semibold mb-2 text-center"
                style={{ color: '#737373' }}
              >
                {t('zone')}
              </label>
              <div className="flex-1 overflow-y-auto pr-1 space-y-1">
                {zones.map((zone) => (
                  <button
                    key={zone.id}
                    onClick={() => setSelectedZone(zone)}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                      selectedZone?.id === zone.id
                        ? 'text-white font-medium'
                        : 'hover:bg-[#F6F6F6]',
                    )}
                    style={
                      selectedZone?.id === zone.id
                        ? { backgroundColor: '#06C167' }
                        : { color: '#737373' }
                    }
                  >
                    {zone.name}
                  </button>
                ))}
                {zones.length === 0 && (
                  <p className="text-xs text-center py-4" style={{ color: '#B0B0B0' }}>
                    {t('noZone')}
                  </p>
                )}
              </div>
            </div>

            <div className="w-px bg-[#EEEEEE] my-2"></div>

            {/* Table Column */}
            <div className="flex-1 flex flex-col">
              <label
                className="text-[13px] font-semibold mb-2 text-center"
                style={{ color: '#737373' }}
              >
                {t('table')}
              </label>
              <div className="flex-1 overflow-y-auto pl-1 space-y-1">
                {availableTables.map((table) => (
                  <button
                    key={table.id}
                    onClick={() => setSelectedTable(table)}
                    className={cn(
                      'w-full text-center px-3 py-2 rounded-lg text-sm transition-colors',
                      selectedTable?.id === table.id
                        ? 'text-white font-bold'
                        : 'hover:bg-[#F6F6F6]',
                    )}
                    style={
                      selectedTable?.id === table.id
                        ? { backgroundColor: '#06C167' }
                        : { color: '#737373' }
                    }
                  >
                    {table.table_number}
                  </button>
                ))}
                {selectedZone && availableTables.length === 0 && (
                  <p className="text-xs text-center py-4" style={{ color: '#B0B0B0' }}>
                    {t('noTable')}
                  </p>
                )}
                {!selectedZone && (
                  <p className="text-xs text-center py-4" style={{ color: '#B0B0B0' }}>
                    {t('selectZone')}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <Button
              className="w-full text-base text-white rounded-xl"
              style={{
                height: 52,
                backgroundColor: selectedTable ? '#06C167' : undefined,
                borderRadius: 12,
              }}
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
