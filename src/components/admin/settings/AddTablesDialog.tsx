'use client';

import { type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AdminModal from '@/components/admin/AdminModal';
import type { Table, Zone } from './tables.types';
import { nextTableStartNumber } from './tables.utils';

interface AddTablesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  selectedZone: Zone | undefined;
  tables: Table[];
  tableCount: number | string;
  onTableCountChange: (value: number | string) => void;
  tableCapacity: number | string;
  onTableCapacityChange: (value: number | string) => void;
  saving: boolean;
}

export function AddTablesDialog({
  isOpen,
  onClose,
  onSubmit,
  selectedZone,
  tables,
  tableCount,
  onTableCountChange,
  tableCapacity,
  onTableCapacityChange,
  saving,
}: AddTablesDialogProps) {
  const t = useTranslations('tables');

  return (
    <AdminModal isOpen={isOpen} onClose={onClose} title={t('modalAddTablesTitle')}>
      <form onSubmit={onSubmit} className="space-y-4 pt-2">
        {selectedZone && (
          <p className="text-sm text-app-text-secondary">
            {t('addTablesZoneLabel')}{' '}
            <span className="font-medium text-app-text">{selectedZone.name}</span>
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="table-count" className="text-sm text-app-text">
              {t('tableCountLabel')}
            </Label>
            <Input
              id="table-count"
              type="number"
              value={tableCount}
              onChange={(e) =>
                onTableCountChange(e.target.value === '' ? '' : Number(e.target.value))
              }
              className="rounded-lg focus:ring-accent/30"
              min={1}
              max={50}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="table-capacity" className="text-sm text-app-text">
              {t('tableCapacityLabel')}
            </Label>
            <Input
              id="table-capacity"
              type="number"
              value={tableCapacity}
              onChange={(e) =>
                onTableCapacityChange(e.target.value === '' ? '' : Number(e.target.value))
              }
              className="rounded-lg focus:ring-accent/30"
              min={1}
              max={50}
              required
            />
          </div>
        </div>
        {selectedZone && (
          <div className="bg-app-bg rounded-lg border border-app-border p-3 text-xs text-app-text-secondary">
            {t('tableNamingPreview')}{' '}
            <span className="font-mono font-medium text-app-text">
              {selectedZone.prefix}-{nextTableStartNumber(tables, selectedZone.prefix)}
            </span>{' '}
            {t('tableNamingTo')}{' '}
            <span className="font-mono font-medium text-app-text">
              {selectedZone.prefix}-
              {nextTableStartNumber(tables, selectedZone.prefix) +
                Math.max(1, Number(tableCount) || 1) -
                1}
            </span>
          </div>
        )}
        <div className="flex justify-end gap-3 pt-4 border-t border-app-border">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            className="bg-accent text-accent-text hover:bg-accent-hover"
            disabled={saving}
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t('addTablesSubmit', { count: tableCount })}
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}
