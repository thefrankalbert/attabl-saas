'use client';

import { Plus, Trash2, Check, X, Grid3x3, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Table, Zone } from './tables.types';

interface TableGridProps {
  selectedZone: Zone | undefined;
  tablesLoading: boolean;
  tables: Table[];
  editingTableId: string | null;
  editingDisplayName: string;
  onAddTables: () => void;
  onDeleteTable: (table: Table) => void;
  onEditingDisplayNameChange: (value: string) => void;
  onSaveTableName: (tableId: string) => void;
  onCancelEditTable: () => void;
  onStartEditTable: (table: Table) => void;
  onUpdateCapacity: (table: Table, newCapacity: number) => void;
  onToggleActive: (table: Table) => void;
  onCreateZone: () => void;
}

export function TableGrid({
  selectedZone,
  tablesLoading,
  tables,
  editingTableId,
  editingDisplayName,
  onAddTables,
  onDeleteTable,
  onEditingDisplayNameChange,
  onSaveTableName,
  onCancelEditTable,
  onStartEditTable,
  onUpdateCapacity,
  onToggleActive,
  onCreateZone,
}: TableGridProps) {
  const t = useTranslations('tables');

  return (
    <div className="flex-1 min-w-0">
      {selectedZone ? (
        <div className="space-y-4">
          {/* Zone header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Grid3x3 className="w-5 h-5 text-app-text-muted" />
              <h2 className="text-lg font-semibold text-app-text">{selectedZone.name}</h2>
              <span className="text-xs text-app-text-muted bg-app-elevated px-2 py-0.5 rounded-full font-mono">
                {selectedZone.prefix}
              </span>
            </div>
            <Button
              size="sm"
              className="gap-2 bg-accent text-accent-text hover:bg-accent-hover"
              onClick={onAddTables}
            >
              <Plus className="w-4 h-4" />
              {t('addTables')}
            </Button>
          </div>

          {/* Tables grid */}
          {tablesLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-32 bg-app-card rounded-lg border border-app-border animate-pulse"
                />
              ))}
            </div>
          ) : tables.length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {tables.map((table) => (
                <div
                  key={table.id}
                  className={cn(
                    'bg-app-card rounded-lg border border-app-border p-3 transition-colors relative group',
                    !table.is_active && 'opacity-60',
                  )}
                >
                  {/* Status indicator + Delete button */}
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full',
                          table.is_active ? 'bg-[var(--success)]' : 'bg-[var(--warning)]',
                        )}
                      />
                      <span className="text-xs font-mono text-app-text-muted">
                        {table.table_number}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete"
                      onClick={() => onDeleteTable(table)}
                      title="Supprimer"
                      className="h-7 w-7 text-app-text-muted transition-opacity hover:text-[var(--destructive)] opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* Display name (editable) */}
                  {editingTableId === table.id ? (
                    <div className="flex items-center gap-1 mb-2">
                      <Input
                        value={editingDisplayName}
                        onChange={(e) => onEditingDisplayNameChange(e.target.value)}
                        className="h-7 text-sm rounded-lg focus:ring-accent/30"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onSaveTableName(table.id);
                          if (e.key === 'Escape') onCancelEditTable();
                        }}
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Confirm"
                        onClick={() => onSaveTableName(table.id)}
                        className="h-7 w-7 text-[var(--success)] hover:opacity-80"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Cancel edit"
                        onClick={() => onCancelEditTable()}
                        className="h-7 w-7 text-app-text-muted hover:text-app-text-secondary"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-sm font-semibold text-app-text mb-2 hover:text-app-text-secondary text-left h-auto px-0 py-0"
                      onClick={() => onStartEditTable(table)}
                    >
                      {table.display_name}
                    </Button>
                  )}

                  {/* Capacity */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs text-app-text-secondary">{t('capacity')}</span>
                    <Select
                      value={String(table.capacity)}
                      onValueChange={(val) => onUpdateCapacity(table, parseInt(val, 10))}
                    >
                      <SelectTrigger className="text-xs h-7 w-16 px-1.5 py-0.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Active toggle */}
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={table.is_active}
                      onCheckedChange={() => onToggleActive(table)}
                    />
                    <span className="text-xs text-app-text-secondary">
                      {table.is_active ? t('active') : t('inactive')}
                    </span>
                  </Label>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-app-card rounded-xl border border-app-border p-16 text-center">
              <div className="w-16 h-16 bg-app-elevated rounded-xl flex items-center justify-center mx-auto mb-4">
                <Grid3x3 className="w-8 h-8 text-app-text-muted" />
              </div>
              <h3 className="text-lg font-bold text-app-text">{t('noTableTitle')}</h3>
              <p className="text-sm text-app-text-secondary mt-2">{t('noTableDesc')}</p>
              <Button
                className="mt-6 bg-accent text-accent-text hover:bg-accent-hover"
                onClick={onAddTables}
              >
                {t('addTablesAction')}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-app-card rounded-xl border border-app-border p-16 text-center">
          <div className="w-16 h-16 bg-app-elevated rounded-xl flex items-center justify-center mx-auto mb-4">
            <MapPin className="w-8 h-8 text-app-text-muted" />
          </div>
          <h3 className="text-lg font-bold text-app-text">{t('noZoneTitle')}</h3>
          <p className="text-sm text-app-text-secondary mt-2">{t('noZoneDesc')}</p>
          <Button
            className="mt-6 bg-accent text-accent-text hover:bg-accent-hover"
            onClick={onCreateZone}
          >
            {t('createZone')}
          </Button>
        </div>
      )}
    </div>
  );
}
