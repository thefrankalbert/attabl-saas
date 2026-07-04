'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { logger } from '@/lib/logger';
import { createTableConfigService } from '@/services/table-config.service';
import {
  actionCreateZone,
  actionUpdateZoneName,
  actionDeleteZone,
  actionInsertTables,
  actionToggleTableActive,
  actionUpdateTableCapacity,
  actionUpdateTableDisplayName,
  actionDeleteTable,
} from '@/app/actions/tables';
import type { Zone, Table } from './tables.types';
import { nextTableStartNumber } from './tables.utils';
import { TableZonesPanel } from './TableZonesPanel';
import { TableGrid } from './TableGrid';
import { AddZoneDialog } from './AddZoneDialog';
import { AddTablesDialog } from './AddTablesDialog';

interface TablesClientProps {
  tenantId: string;
  venueId: string;
  initialZones: Zone[];
  initialTables: Table[];
  initialSelectedZoneId: string | null;
}

// --- Component ------------------------------------------

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

  // --- State ----------------------------------------------
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

  // --- Data Fetching ------------------------------------

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: supabase (createClient) is a fresh instance each render and toast/t are stable; excluding them keeps loadZones stable. tenantId is the only reactive input and is listed (2026-06-18)
    [tenantId],
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: supabase (createClient) is a fresh instance each render and toast/t are stable; excluding them keeps loadTables stable. tenantId is the only reactive input and is listed (2026-06-18)
    [tenantId],
  );

  // --- Zone Handlers --------------------------------------

  const handleSelectZone = async (zoneId: string) => {
    setSelectedZoneId(zoneId);
    await loadTables(zoneId);
  };

  const handleAddZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zoneName.trim() || !zonePrefix.trim()) return;

    setSavingZone(true);
    const result = await actionCreateZone(
      tenantId,
      venueId,
      zoneName.trim(),
      zonePrefix.trim(),
      zones.length,
    );
    if (result.error) {
      logger.error('Failed to create zone', { error: result.error });
      toast({ title: t('errorCreateZone'), variant: 'destructive' });
      setSavingZone(false);
      return;
    }
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
    setSavingZone(false);
  };

  const handleStartEditZone = (zone: Zone) => {
    setEditingZoneId(zone.id);
    setEditingZoneName(zone.name);
  };

  const handleSaveZoneName = async (zoneId: string) => {
    if (!editingZoneName.trim()) return;

    const result = await actionUpdateZoneName(tenantId, zoneId, editingZoneName.trim());
    if (result.error) {
      logger.error('Failed to update zone name', { error: result.error });
      toast({ title: t('errorUpdateZone'), variant: 'destructive' });
    } else {
      toast({ title: t('successUpdateZone') });
      await loadZones(venueId);
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

    const result = await actionDeleteZone(tenantId, zone.id);
    if (result.error) {
      logger.error('Failed to delete zone', { error: result.error });
      toast({ title: t('errorDeleteZone'), variant: 'destructive' });
      return;
    }
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
  };

  // --- Table Handlers -------------------------------------

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

    const startNumber = nextTableStartNumber(tables, selectedZone.prefix);

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

    const result = await actionInsertTables(tenantId, newTables);
    if (result.error) {
      logger.error('Failed to create tables', { error: result.error });
      toast({ title: t('errorCreateTables'), variant: 'destructive' });
      setSavingTables(false);
      return;
    }
    toast({ title: t('successCreateTables', { count }) });
    setShowAddTables(false);
    setTableCount(1);
    setTableCapacity(4);
    await loadTables(selectedZoneId);
    setSavingTables(false);
  };

  const handleToggleActive = async (table: Table) => {
    const result = await actionToggleTableActive(tenantId, table.id, !table.is_active);
    if (result.error) {
      logger.error('Failed to toggle table status', { error: result.error });
      toast({ title: t('errorToggleTable'), variant: 'destructive' });
      return;
    }
    setTables((prev) =>
      prev.map((tbl) => (tbl.id === table.id ? { ...tbl, is_active: !tbl.is_active } : tbl)),
    );
  };

  const handleUpdateCapacity = async (table: Table, newCapacity: number) => {
    const result = await actionUpdateTableCapacity(tenantId, table.id, newCapacity);
    if (result.error) {
      logger.error('Failed to update capacity', { error: result.error });
      toast({ title: t('errorUpdateCapacity'), variant: 'destructive' });
      return;
    }
    setTables((prev) =>
      prev.map((tbl) => (tbl.id === table.id ? { ...tbl, capacity: newCapacity } : tbl)),
    );
  };

  const handleStartEditTable = (table: Table) => {
    setEditingTableId(table.id);
    setEditingDisplayName(table.display_name);
  };

  const handleSaveTableName = async (tableId: string) => {
    if (!editingDisplayName.trim()) return;

    const result = await actionUpdateTableDisplayName(tenantId, tableId, editingDisplayName.trim());
    if (result.error) {
      logger.error('Failed to update table name', { error: result.error });
      toast({ title: t('errorUpdateTableName'), variant: 'destructive' });
    } else {
      setTables((prev) =>
        prev.map((tbl) =>
          tbl.id === tableId ? { ...tbl, display_name: editingDisplayName.trim() } : tbl,
        ),
      );
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

    const result = await actionDeleteTable(tenantId, table.id);
    if (result.error) {
      logger.error('Failed to delete table', { error: result.error });
      toast({ title: t('errorDeleteTable'), variant: 'destructive' });
      return;
    }
    toast({ title: t('successDeleteTable') });
    setTables((prev) => prev.filter((tbl) => tbl.id !== table.id));
  };

  // --- Render -------------------------------------------

  const selectedZone = zones.find((z) => z.id === selectedZoneId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="shrink-0 space-y-4">
        <AdminPageHeader title={t('title')} />
      </div>

      {/* Main Layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Panel: Zone List */}
        <TableZonesPanel
          zones={zones}
          selectedZoneId={selectedZoneId}
          editingZoneId={editingZoneId}
          editingZoneName={editingZoneName}
          onSelectZone={handleSelectZone}
          onEditingZoneNameChange={setEditingZoneName}
          onSaveZoneName={handleSaveZoneName}
          onCancelEditZone={() => setEditingZoneId(null)}
          onStartEditZone={handleStartEditZone}
          onDeleteZone={handleDeleteZone}
          onAddZone={() => setShowAddZone(true)}
        />

        {/* Right Panel: Tables Grid */}
        <TableGrid
          selectedZone={selectedZone}
          tablesLoading={tablesLoading}
          tables={tables}
          editingTableId={editingTableId}
          editingDisplayName={editingDisplayName}
          onAddTables={() => setShowAddTables(true)}
          onDeleteTable={handleDeleteTable}
          onEditingDisplayNameChange={setEditingDisplayName}
          onSaveTableName={handleSaveTableName}
          onCancelEditTable={() => setEditingTableId(null)}
          onStartEditTable={handleStartEditTable}
          onUpdateCapacity={handleUpdateCapacity}
          onToggleActive={handleToggleActive}
          onCreateZone={() => setShowAddZone(true)}
        />
      </div>

      {/* Add Zone Modal */}
      <AddZoneDialog
        isOpen={showAddZone}
        onClose={() => setShowAddZone(false)}
        onSubmit={handleAddZone}
        zoneName={zoneName}
        onZoneNameChange={setZoneName}
        zonePrefix={zonePrefix}
        onZonePrefixChange={setZonePrefix}
        saving={savingZone}
      />

      {/* Add Tables Modal */}
      <AddTablesDialog
        isOpen={showAddTables}
        onClose={() => setShowAddTables(false)}
        onSubmit={handleAddTables}
        selectedZone={selectedZone}
        tables={tables}
        tableCount={tableCount}
        onTableCountChange={setTableCount}
        tableCapacity={tableCapacity}
        onTableCapacityChange={setTableCapacity}
        saving={savingTables}
      />
      {ConfirmDialog}
    </div>
  );
}
