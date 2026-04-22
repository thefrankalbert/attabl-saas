'use client';

import { useState, useCallback } from 'react';
import { Plus, Loader2, Trash2, Pencil, Check, X, Grid3x3, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
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
import AdminModal from '@/components/admin/AdminModal';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { createTableConfigService } from '@/services/table-config.service';

// ─── Types ──────────────────────────────────────────────

interface Zone {
  id: string;
  name: string;
  prefix: string;
  venue_id: string;
  display_order: number;
}

interface Table {
  id: string;
  zone_id: string;
  table_number: string;
  display_name: string;
  capacity: number;
  is_active: boolean;
}

interface TablesClientProps {
  tenantId: string;
  venueId: string;
  initialZones: Zone[];
  initialTables: Table[];
  initialSelectedZoneId: string | null;
}

// ─── Component ──────────────────────────────────────────

export function TablesClient({
  tenantId,
  venueId,
  initialZones,
  initialTables,
  initialSelectedZoneId,
}: TablesClientProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const t = useTranslations('tables');
  const tc = useTranslations('common');
  const { confirm, Dialog: ConfirmDialog } = useConfirmDialog();

  // ─── State ──────────────────────────────────────────────
  const [zones, setZones] = useState<Zone[]>(initialZones);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(initialSelectedZoneId);
  const [tables, setTables] = useState<Table[]>(initialTables);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [showAddZone, setShowAddZone] = useState(false);
  const [showAddTables, setShowAddTables] = useState(false);

  // Zone form state
  const [zoneName, setZoneName] = useState('');
  const [zonePrefix, setZonePrefix] = useState('');
  const [savingZone, setSavingZone] = useState(false);

  // Add tables form state
  const [tableCount, setTableCount] = useState<number | string>(1);
  const [tableCapacity, setTableCapacity] = useState<number | string>(4);
  const [savingTables, setSavingTables] = useState(false);

  // Inline editing state
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [editingZoneName, setEditingZoneName] = useState('');
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState('');

  // ─── Data Fetching ────────────────────────────────────

  const loadZones = useCallback(
    async (vId: string) => {
      try {
        const svc = createTableConfigService(supabase);
        const zoneData = (await svc.listZonesForVenue(tenantId, vId)) as Zone[];
        setZones(zoneData);
        return zoneData;
      } catch (error) {
        logger.error('Failed to load zones', { error });
        toast({ title: t('errorLoadZones'), variant: 'destructive' });
        return [];
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const loadTables = useCallback(
    async (zoneId: string) => {
      setTablesLoading(true);
      try {
        const svc = createTableConfigService(supabase);
        const tableData = (await svc.listTablesForZone(tenantId, zoneId)) as Table[];
        setTables(tableData);
      } catch (error) {
        logger.error('Failed to load tables', { error });
        toast({ title: t('errorLoadTables'), variant: 'destructive' });
        setTables([]);
      } finally {
        setTablesLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ─── Zone Handlers ──────────────────────────────────────

  const handleSelectZone = async (zoneId: string) => {
    setSelectedZoneId(zoneId);
    await loadTables(zoneId);
  };

  const handleAddZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zoneName.trim() || !zonePrefix.trim()) return;

    setSavingZone(true);
    try {
      const tableConfigService = createTableConfigService(supabase);
      await tableConfigService.createZone(
        venueId,
        zoneName.trim(),
        zonePrefix.trim(),
        zones.length,
      );
      toast({ title: t('successCreateZone') });
      setShowAddZone(false);
      setZoneName('');
      setZonePrefix('');
      const newZones = await loadZones(venueId);
      // Select the new zone
      if (newZones.length > 0) {
        const lastZone = newZones[newZones.length - 1];
        setSelectedZoneId(lastZone.id);
        await loadTables(lastZone.id);
      }
    } catch (err: unknown) {
      logger.error('Failed to create zone', { error: err });
      toast({ title: t('errorCreateZone'), variant: 'destructive' });
    }
    setSavingZone(false);
  };

  const handleStartEditZone = (zone: Zone) => {
    setEditingZoneId(zone.id);
    setEditingZoneName(zone.name);
  };

  const handleSaveZoneName = async (zoneId: string) => {
    if (!editingZoneName.trim()) return;

    try {
      const tableConfigService = createTableConfigService(supabase);
      await tableConfigService.updateZoneName(zoneId, editingZoneName.trim());
      toast({ title: t('successUpdateZone') });
      await loadZones(venueId);
    } catch (err: unknown) {
      logger.error('Failed to update zone name', { error: err });
      toast({ title: t('errorUpdateZone'), variant: 'destructive' });
    }
    setEditingZoneId(null);
  };

  const handleDeleteZone = async (zone: Zone) => {
    const ok = await confirm({
      title: tc('delete'),
      description: t('confirmDeleteZone', { name: zone.name }),
      confirmLabel: tc('delete'),
      cancelLabel: tc('cancel'),
      destructive: true,
    });
    if (!ok) return;

    try {
      const tableConfigService = createTableConfigService(supabase);
      await tableConfigService.deleteZone(zone.id);
      toast({ title: t('successDeleteZone') });
      const newZones = await loadZones(venueId);
      if (selectedZoneId === zone.id) {
        if (newZones.length > 0) {
          setSelectedZoneId(newZones[0].id);
          await loadTables(newZones[0].id);
        } else {
          setSelectedZoneId(null);
          setTables([]);
        }
      }
    } catch (err: unknown) {
      logger.error('Failed to delete zone', { error: err });
      toast({ title: t('errorDeleteZone'), variant: 'destructive' });
    }
  };

  // ─── Table Handlers ─────────────────────────────────────

  const handleAddTables = async (e: React.FormEvent) => {
    e.preventDefault();
    const count = Math.max(1, Number(tableCount) || 1);
    const capacity = Math.max(1, Number(tableCapacity) || 4);
    if (!selectedZoneId || count < 1) return;

    setSavingTables(true);

    const selectedZone = zones.find((z) => z.id === selectedZoneId);
    if (!selectedZone) {
      setSavingTables(false);
      return;
    }

    // Find highest existing table number for this zone
    const existingNumbers = tables
      .map((t) => {
        const num = parseInt(t.table_number.replace(selectedZone.prefix + '-', ''), 10);
        return isNaN(num) ? 0 : num;
      })
      .sort((a, b) => b - a);

    const startNumber = existingNumbers.length > 0 ? existingNumbers[0] + 1 : 1;

    const newTables = Array.from({ length: count }, (_, i) => {
      const num = startNumber + i;
      const tableNumber = `${selectedZone.prefix}-${num}`;
      return {
        zone_id: selectedZoneId,
        table_number: tableNumber,
        display_name: tableNumber,
        capacity,
        is_active: true,
      };
    });

    try {
      const tableConfigService = createTableConfigService(supabase);
      await tableConfigService.insertTables(newTables);
      toast({ title: t('successCreateTables', { count }) });
      setShowAddTables(false);
      setTableCount(1);
      setTableCapacity(4);
      await loadTables(selectedZoneId);
    } catch (err: unknown) {
      logger.error('Failed to create tables', { error: err });
      toast({ title: t('errorCreateTables'), variant: 'destructive' });
    }
    setSavingTables(false);
  };

  const handleToggleActive = async (table: Table) => {
    try {
      const tableConfigService = createTableConfigService(supabase);
      await tableConfigService.toggleTableActive(table.id, !table.is_active);
      setTables((prev) =>
        prev.map((t) => (t.id === table.id ? { ...t, is_active: !t.is_active } : t)),
      );
    } catch (err: unknown) {
      logger.error('Failed to toggle table status', { error: err });
      toast({ title: t('errorToggleTable'), variant: 'destructive' });
    }
  };

  const handleUpdateCapacity = async (table: Table, newCapacity: number) => {
    try {
      const tableConfigService = createTableConfigService(supabase);
      await tableConfigService.updateTableCapacity(table.id, newCapacity);
      setTables((prev) =>
        prev.map((tbl) => (tbl.id === table.id ? { ...tbl, capacity: newCapacity } : tbl)),
      );
    } catch (err: unknown) {
      logger.error('Failed to update capacity', { error: err });
      toast({ title: t('errorUpdateCapacity'), variant: 'destructive' });
    }
  };

  const handleStartEditTable = (table: Table) => {
    setEditingTableId(table.id);
    setEditingDisplayName(table.display_name);
  };

  const handleSaveTableName = async (tableId: string) => {
    if (!editingDisplayName.trim()) return;

    try {
      const tableConfigService = createTableConfigService(supabase);
      await tableConfigService.updateTableDisplayName(tableId, editingDisplayName.trim());
      setTables((prev) =>
        prev.map((tbl) =>
          tbl.id === tableId ? { ...tbl, display_name: editingDisplayName.trim() } : tbl,
        ),
      );
    } catch (err: unknown) {
      logger.error('Failed to update table name', { error: err });
      toast({ title: t('errorUpdateTableName'), variant: 'destructive' });
    }
    setEditingTableId(null);
  };

  const handleDeleteTable = async (table: Table) => {
    const ok = await confirm({
      title: tc('delete'),
      description: t('confirmDeleteTable', { name: table.display_name }),
      confirmLabel: tc('delete'),
      cancelLabel: tc('cancel'),
      destructive: true,
    });
    if (!ok) return;

    try {
      const tableConfigService = createTableConfigService(supabase);
      await tableConfigService.deleteTable(table.id);
      toast({ title: t('successDeleteTable') });
      setTables((prev) => prev.filter((tbl) => tbl.id !== table.id));
    } catch (err: unknown) {
      logger.error('Failed to delete table', { error: err });
      toast({ title: t('errorDeleteTable'), variant: 'destructive' });
    }
  };

  // ─── Render ───────────────────────────────────────────

  const selectedZone = zones.find((z) => z.id === selectedZoneId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-app-text">{t('title')}</h1>
        <p className="text-app-text-secondary text-sm mt-1">{t('subtitle')}</p>
      </div>

      {/* Main Layout */}
      <div className="flex flex-col @lg:flex-row gap-6">
        {/* Left Panel: Zone List */}
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
                      handleSelectZone(zone.id);
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
                        onChange={(e) => setEditingZoneName(e.target.value)}
                        className="h-7 text-sm rounded-lg focus:ring-accent"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveZoneName(zone.id);
                          if (e.key === 'Escape') setEditingZoneId(null);
                        }}
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveZoneName(zone.id);
                        }}
                        className="h-7 w-7 text-emerald-600 hover:text-emerald-700"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingZoneId(null);
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
                          selectedZoneId === zone.id
                            ? 'font-semibold text-app-text'
                            : 'text-app-text',
                        )}
                      >
                        {zone.name}
                      </span>
                      <span className="text-xs text-app-text-muted font-mono">{zone.prefix}</span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEditZone(zone);
                          }}
                          className="h-7 w-7 text-app-text-muted hover:text-app-text-secondary"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteZone(zone);
                          }}
                          title="Supprimer"
                          className="h-7 w-7 text-red-400 hover:text-red-600"
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
              onClick={() => setShowAddZone(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              {t('addZone')}
            </Button>
          </div>
        </div>

        {/* Right Panel: Tables Grid */}
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
                  onClick={() => setShowAddTables(true)}
                >
                  <Plus className="w-4 h-4" />
                  {t('addTables')}
                </Button>
              </div>

              {/* Tables grid */}
              {tablesLoading ? (
                <div className="grid grid-cols-2 @sm:grid-cols-3 @md:grid-cols-4 gap-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-32 bg-app-card rounded-lg border border-app-border animate-pulse"
                    />
                  ))}
                </div>
              ) : tables.length > 0 ? (
                <div className="grid grid-cols-2 @sm:grid-cols-3 @md:grid-cols-4 gap-3">
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
                              table.is_active ? 'bg-emerald-400' : 'bg-amber-400',
                            )}
                          />
                          <span className="text-xs font-mono text-app-text-muted">
                            {table.table_number}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteTable(table)}
                          title="Supprimer"
                          className="h-7 w-7 text-app-text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      {/* Display name (editable) */}
                      {editingTableId === table.id ? (
                        <div className="flex items-center gap-1 mb-2">
                          <Input
                            value={editingDisplayName}
                            onChange={(e) => setEditingDisplayName(e.target.value)}
                            className="h-7 text-sm rounded-lg focus:ring-accent/30"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveTableName(table.id);
                              if (e.key === 'Escape') setEditingTableId(null);
                            }}
                            autoFocus
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleSaveTableName(table.id)}
                            className="h-7 w-7 text-emerald-600 hover:text-emerald-700"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-sm font-semibold text-app-text mb-2 hover:text-app-text-secondary text-left h-auto px-0 py-0"
                          onClick={() => handleStartEditTable(table)}
                        >
                          {table.display_name}
                        </Button>
                      )}

                      {/* Capacity */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs text-app-text-secondary">{t('capacity')}</span>
                        <Select
                          value={String(table.capacity)}
                          onValueChange={(val) => handleUpdateCapacity(table, parseInt(val, 10))}
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
                          onCheckedChange={() => handleToggleActive(table)}
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
                    onClick={() => setShowAddTables(true)}
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
                onClick={() => setShowAddZone(true)}
              >
                {t('createZone')}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Add Zone Modal */}
      <AdminModal
        isOpen={showAddZone}
        onClose={() => setShowAddZone(false)}
        title={t('modalAddZoneTitle')}
      >
        <form onSubmit={handleAddZone} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="zone-name" className="text-sm text-app-text">
              {t('zoneNameLabel')}
            </Label>
            <Input
              id="zone-name"
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              placeholder={t('zoneNamePlaceholder')}
              className="rounded-lg focus:ring-accent"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="zone-prefix" className="text-sm text-app-text">
              {t('zonePrefixLabel')}
            </Label>
            <Input
              id="zone-prefix"
              value={zonePrefix}
              onChange={(e) => setZonePrefix(e.target.value)}
              placeholder={t('zonePrefixPlaceholder')}
              className="rounded-lg focus:ring-accent"
              required
              maxLength={5}
            />
            <p className="text-xs text-app-text-secondary">{t('zonePrefixHelp')}</p>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-app-border">
            <Button type="button" variant="ghost" onClick={() => setShowAddZone(false)}>
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              className="bg-accent text-accent-text hover:bg-accent-hover"
              disabled={savingZone}
            >
              {savingZone && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('createZoneSubmit')}
            </Button>
          </div>
        </form>
      </AdminModal>

      {/* Add Tables Modal */}
      <AdminModal
        isOpen={showAddTables}
        onClose={() => setShowAddTables(false)}
        title={t('modalAddTablesTitle')}
      >
        <form onSubmit={handleAddTables} className="space-y-4 pt-2">
          {selectedZone && (
            <p className="text-sm text-app-text-secondary">
              {t('addTablesZoneLabel')}{' '}
              <span className="font-medium text-app-text">{selectedZone.name}</span>
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="table-count" className="text-sm text-app-text">
                {t('tableCountLabel')}
              </Label>
              <Input
                id="table-count"
                type="number"
                value={tableCount}
                onChange={(e) => setTableCount(e.target.value === '' ? '' : Number(e.target.value))}
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
                  setTableCapacity(e.target.value === '' ? '' : Number(e.target.value))
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
                {selectedZone.prefix}-{(tables.length > 0 ? tables.length : 0) + 1}
              </span>{' '}
              {t('tableNamingTo')}{' '}
              <span className="font-mono font-medium text-app-text">
                {selectedZone.prefix}-
                {(tables.length > 0 ? tables.length : 0) + (Number(tableCount) || 0)}
              </span>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t border-app-border">
            <Button type="button" variant="ghost" onClick={() => setShowAddTables(false)}>
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              className="bg-accent text-accent-text hover:bg-accent-hover"
              disabled={savingTables}
            >
              {savingTables && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('addTablesSubmit', { count: tableCount })}
            </Button>
          </div>
        </form>
      </AdminModal>
      {ConfirmDialog}
    </div>
  );
}
