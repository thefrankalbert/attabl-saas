'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, Trash2, Pencil, Check, X, Grid3x3, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AdminModal from '@/components/admin/AdminModal';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';

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

// ─── Component ──────────────────────────────────────────

export default function TablesPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const t = useTranslations('tables');

  // ─── State ──────────────────────────────────────────────
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [showAddZone, setShowAddZone] = useState(false);
  const [showAddTables, setShowAddTables] = useState(false);
  const [venueId, setVenueId] = useState<string | null>(null);

  // Zone form state
  const [zoneName, setZoneName] = useState('');
  const [zonePrefix, setZonePrefix] = useState('');
  const [savingZone, setSavingZone] = useState(false);

  // Add tables form state
  const [tableCount, setTableCount] = useState(1);
  const [tableCapacity, setTableCapacity] = useState(4);
  const [savingTables, setSavingTables] = useState(false);

  // Inline editing state
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [editingZoneName, setEditingZoneName] = useState('');
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState('');

  // ─── Data Fetching ────────────────────────────────────

  const loadZones = useCallback(
    async (vId: string) => {
      const { data, error } = await supabase
        .from('zones')
        .select('*')
        .eq('venue_id', vId)
        .order('display_order');

      if (error) {
        logger.error('Failed to load zones', { error });
        toast({ title: t('errorLoadZones'), variant: 'destructive' });
        return [];
      }

      const zoneData = (data || []) as Zone[];
      setZones(zoneData);
      return zoneData;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const loadTables = useCallback(
    async (zoneId: string) => {
      setTablesLoading(true);
      const { data, error } = await supabase
        .from('tables')
        .select('*')
        .eq('zone_id', zoneId)
        .order('table_number');

      if (error) {
        logger.error('Failed to load tables', { error });
        toast({ title: t('errorLoadTables'), variant: 'destructive' });
      }

      setTables((data || []) as Table[]);
      setTablesLoading(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const init = async () => {
      setLoading(true);

      // Get tenant via admin_users join
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('tenant_id, tenants!inner(id, slug)')
        .eq('user_id', user.id)
        .single();

      if (!adminUser) {
        setLoading(false);
        return;
      }

      const tenantId = adminUser.tenant_id as string;

      // Get venue or create default
      let { data: venues } = await supabase.from('venues').select('*').eq('tenant_id', tenantId);

      if (!venues || venues.length === 0) {
        const { data: newVenue, error: venueErr } = await supabase
          .from('venues')
          .insert([
            {
              tenant_id: tenantId,
              name: 'Principal',
              is_default: true,
            },
          ])
          .select()
          .single();

        if (venueErr) {
          logger.error('Failed to create default venue', { error: venueErr });
          toast({
            title: t('errorCreateVenue'),
            variant: 'destructive',
          });
          setLoading(false);
          return;
        }

        venues = newVenue ? [newVenue] : [];
      }

      const venue = venues[0];
      setVenueId(venue.id as string);

      const zoneData = await loadZones(venue.id as string);

      // Select first zone if available
      if (zoneData.length > 0) {
        setSelectedZoneId(zoneData[0].id);
        await loadTables(zoneData[0].id);
      }

      setLoading(false);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Zone Handlers ──────────────────────────────────────

  const handleSelectZone = async (zoneId: string) => {
    setSelectedZoneId(zoneId);
    await loadTables(zoneId);
  };

  const handleAddZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zoneName.trim() || !zonePrefix.trim() || !venueId) return;

    setSavingZone(true);
    const { error } = await supabase.from('zones').insert([
      {
        venue_id: venueId,
        name: zoneName.trim(),
        prefix: zonePrefix.trim().toUpperCase(),
        display_order: zones.length,
      },
    ]);

    if (error) {
      logger.error('Failed to create zone', { error });
      toast({ title: t('errorCreateZone'), variant: 'destructive' });
    } else {
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
    }
    setSavingZone(false);
  };

  const handleStartEditZone = (zone: Zone) => {
    setEditingZoneId(zone.id);
    setEditingZoneName(zone.name);
  };

  const handleSaveZoneName = async (zoneId: string) => {
    if (!editingZoneName.trim()) return;

    const { error } = await supabase
      .from('zones')
      .update({ name: editingZoneName.trim() })
      .eq('id', zoneId);

    if (error) {
      logger.error('Failed to update zone name', { error });
      toast({ title: t('errorUpdateZone'), variant: 'destructive' });
    } else {
      toast({ title: t('successUpdateZone') });
      if (venueId) await loadZones(venueId);
    }
    setEditingZoneId(null);
  };

  const handleDeleteZone = async (zone: Zone) => {
    if (!confirm(t('confirmDeleteZone', { name: zone.name }))) return;

    const { error } = await supabase.from('zones').delete().eq('id', zone.id);

    if (error) {
      logger.error('Failed to delete zone', { error });
      toast({ title: t('errorDeleteZone'), variant: 'destructive' });
    } else {
      toast({ title: t('successDeleteZone') });
      if (venueId) {
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
      }
    }
  };

  // ─── Table Handlers ─────────────────────────────────────

  const handleAddTables = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedZoneId || tableCount < 1) return;

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

    const newTables = Array.from({ length: tableCount }, (_, i) => {
      const num = startNumber + i;
      const tableNumber = `${selectedZone.prefix}-${num}`;
      return {
        zone_id: selectedZoneId,
        table_number: tableNumber,
        display_name: tableNumber,
        capacity: tableCapacity,
        is_active: true,
      };
    });

    const { error } = await supabase.from('tables').insert(newTables);

    if (error) {
      logger.error('Failed to create tables', { error });
      toast({ title: t('errorCreateTables'), variant: 'destructive' });
    } else {
      toast({ title: t('successCreateTables', { count: tableCount }) });
      setShowAddTables(false);
      setTableCount(1);
      setTableCapacity(4);
      await loadTables(selectedZoneId);
    }
    setSavingTables(false);
  };

  const handleToggleActive = async (table: Table) => {
    const { error } = await supabase
      .from('tables')
      .update({ is_active: !table.is_active })
      .eq('id', table.id);

    if (error) {
      logger.error('Failed to toggle table status', { error });
      toast({ title: t('errorToggleTable'), variant: 'destructive' });
    } else {
      setTables((prev) =>
        prev.map((t) => (t.id === table.id ? { ...t, is_active: !t.is_active } : t)),
      );
    }
  };

  const handleUpdateCapacity = async (table: Table, newCapacity: number) => {
    const { error } = await supabase
      .from('tables')
      .update({ capacity: newCapacity })
      .eq('id', table.id);

    if (error) {
      logger.error('Failed to update capacity', { error });
      toast({ title: t('errorUpdateCapacity'), variant: 'destructive' });
    } else {
      setTables((prev) =>
        prev.map((tbl) => (tbl.id === table.id ? { ...tbl, capacity: newCapacity } : tbl)),
      );
    }
  };

  const handleStartEditTable = (table: Table) => {
    setEditingTableId(table.id);
    setEditingDisplayName(table.display_name);
  };

  const handleSaveTableName = async (tableId: string) => {
    if (!editingDisplayName.trim()) return;

    const { error } = await supabase
      .from('tables')
      .update({ display_name: editingDisplayName.trim() })
      .eq('id', tableId);

    if (error) {
      logger.error('Failed to update table name', { error });
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
    if (!confirm(t('confirmDeleteTable', { name: table.display_name }))) return;

    const { error } = await supabase.from('tables').delete().eq('id', table.id);

    if (error) {
      logger.error('Failed to delete table', { error });
      toast({ title: t('errorDeleteTable'), variant: 'destructive' });
    } else {
      toast({ title: t('successDeleteTable') });
      setTables((prev) => prev.filter((tbl) => tbl.id !== table.id));
    }
  };

  // ─── Loading State ────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────

  const selectedZone = zones.find((z) => z.id === selectedZoneId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">{t('title')}</h1>
        <p className="text-neutral-500 text-sm mt-1">{t('subtitle')}</p>
      </div>

      {/* Main Layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Panel: Zone List */}
        <div className="w-full lg:w-72 flex-shrink-0">
          <div className="bg-white rounded-xl border border-neutral-100 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-neutral-900">{t('zonesHeader')}</h2>
              <span className="text-xs text-neutral-400">
                {t('zoneCount', { count: zones.length })}
              </span>
            </div>

            <div className="space-y-1">
              {zones.map((zone) => (
                <div
                  key={zone.id}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2.5 cursor-pointer transition-colors group',
                    selectedZoneId === zone.id
                      ? 'bg-[#CCFF00]/10 border border-[#CCFF00]/30'
                      : 'hover:bg-neutral-50 border border-transparent',
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
                      selectedZoneId === zone.id ? 'text-neutral-700' : 'text-neutral-400',
                    )}
                  />

                  {editingZoneId === zone.id ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <Input
                        value={editingZoneName}
                        onChange={(e) => setEditingZoneName(e.target.value)}
                        className="h-7 text-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveZoneName(zone.id);
                          if (e.key === 'Escape') setEditingZoneId(null);
                        }}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveZoneName(zone.id);
                        }}
                        className="p-1 text-green-600 hover:text-green-700"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingZoneId(null);
                        }}
                        className="p-1 text-neutral-400 hover:text-neutral-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span
                        className={cn(
                          'text-sm flex-1 min-w-0 truncate',
                          selectedZoneId === zone.id
                            ? 'font-semibold text-neutral-900'
                            : 'text-neutral-700',
                        )}
                      >
                        {zone.name}
                      </span>
                      <span className="text-xs text-neutral-400 font-mono">{zone.prefix}</span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEditZone(zone);
                          }}
                          className="p-1 text-neutral-400 hover:text-neutral-600"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteZone(zone);
                          }}
                          className="p-1 text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
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
                  <Grid3x3 className="w-5 h-5 text-neutral-400" />
                  <h2 className="text-lg font-semibold text-neutral-900">{selectedZone.name}</h2>
                  <span className="text-xs text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full font-mono">
                    {selectedZone.prefix}
                  </span>
                </div>
                <Button
                  variant="lime"
                  size="sm"
                  className="gap-2"
                  onClick={() => setShowAddTables(true)}
                >
                  <Plus className="w-4 h-4" />
                  {t('addTables')}
                </Button>
              </div>

              {/* Tables grid */}
              {tablesLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-32 bg-white rounded-xl border border-neutral-100 animate-pulse"
                    />
                  ))}
                </div>
              ) : tables.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {tables.map((table) => (
                    <div
                      key={table.id}
                      className={cn(
                        'bg-white rounded-xl border p-4 transition-colors relative group',
                        table.is_active ? 'border-neutral-200' : 'border-neutral-100 opacity-60',
                      )}
                    >
                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={() => handleDeleteTable(table)}
                        className="absolute top-2 right-2 p-1 text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Table number */}
                      <div className="text-xs font-mono text-neutral-400 mb-1">
                        {table.table_number}
                      </div>

                      {/* Display name (editable) */}
                      {editingTableId === table.id ? (
                        <div className="flex items-center gap-1 mb-2">
                          <Input
                            value={editingDisplayName}
                            onChange={(e) => setEditingDisplayName(e.target.value)}
                            className="h-7 text-sm"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveTableName(table.id);
                              if (e.key === 'Escape') setEditingTableId(null);
                            }}
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveTableName(table.id)}
                            className="p-1 text-green-600 hover:text-green-700"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="text-sm font-semibold text-neutral-900 mb-2 hover:text-neutral-600 text-left"
                          onClick={() => handleStartEditTable(table)}
                        >
                          {table.display_name}
                        </button>
                      )}

                      {/* Capacity */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs text-neutral-500">{t('capacity')}</span>
                        <select
                          value={table.capacity}
                          onChange={(e) =>
                            handleUpdateCapacity(table, parseInt(e.target.value, 10))
                          }
                          className="text-xs border border-neutral-200 rounded-md px-1.5 py-0.5 text-neutral-700 bg-white"
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Active toggle */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={table.is_active}
                          onChange={() => handleToggleActive(table)}
                          className="w-4 h-4 rounded border-neutral-300 text-[#CCFF00] focus:ring-[#CCFF00]/50"
                        />
                        <span className="text-xs text-neutral-500">
                          {table.is_active ? t('active') : t('inactive')}
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-neutral-100 p-16 text-center">
                  <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Grid3x3 className="w-8 h-8 text-neutral-400" />
                  </div>
                  <h3 className="text-lg font-bold text-neutral-900">{t('noTableTitle')}</h3>
                  <p className="text-sm text-neutral-500 mt-2">{t('noTableDesc')}</p>
                  <Button variant="lime" className="mt-6" onClick={() => setShowAddTables(true)}>
                    {t('addTablesAction')}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-neutral-100 p-16 text-center">
              <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-8 h-8 text-neutral-400" />
              </div>
              <h3 className="text-lg font-bold text-neutral-900">{t('noZoneTitle')}</h3>
              <p className="text-sm text-neutral-500 mt-2">{t('noZoneDesc')}</p>
              <Button variant="lime" className="mt-6" onClick={() => setShowAddZone(true)}>
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
            <Label htmlFor="zone-name">{t('zoneNameLabel')}</Label>
            <Input
              id="zone-name"
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              placeholder={t('zoneNamePlaceholder')}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="zone-prefix">{t('zonePrefixLabel')}</Label>
            <Input
              id="zone-prefix"
              value={zonePrefix}
              onChange={(e) => setZonePrefix(e.target.value)}
              placeholder={t('zonePrefixPlaceholder')}
              required
              maxLength={5}
            />
            <p className="text-xs text-neutral-400">{t('zonePrefixHelp')}</p>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="ghost" onClick={() => setShowAddZone(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="lime" disabled={savingZone}>
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
            <p className="text-sm text-neutral-500">
              {t('addTablesZoneLabel')}{' '}
              <span className="font-medium text-neutral-700">{selectedZone.name}</span>
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="table-count">{t('tableCountLabel')}</Label>
              <Input
                id="table-count"
                type="number"
                value={tableCount}
                onChange={(e) => setTableCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                min={1}
                max={50}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="table-capacity">{t('tableCapacityLabel')}</Label>
              <Input
                id="table-capacity"
                type="number"
                value={tableCapacity}
                onChange={(e) => setTableCapacity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                min={1}
                max={50}
                required
              />
            </div>
          </div>
          {selectedZone && (
            <div className="bg-neutral-50 rounded-lg p-3 text-xs text-neutral-500">
              {t('tableNamingPreview')}{' '}
              <span className="font-mono font-medium text-neutral-700">
                {selectedZone.prefix}-{(tables.length > 0 ? tables.length : 0) + 1}
              </span>{' '}
              {t('tableNamingTo')}{' '}
              <span className="font-mono font-medium text-neutral-700">
                {selectedZone.prefix}-{(tables.length > 0 ? tables.length : 0) + tableCount}
              </span>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="ghost" onClick={() => setShowAddTables(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="lime" disabled={savingTables}>
              {savingTables && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('addTablesSubmit', { count: tableCount })}
            </Button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
