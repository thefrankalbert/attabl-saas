'use client';

import { Search, LayoutGrid, Map, X as CloseIcon, Move, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ServiceRoomSection } from './ServiceRoomSection';
import { ServicePlan2D } from './ServicePlan2D';
import type { PlanPosition, PlanPositions } from './use-plan-positions';
import type { ServiceServerVM, ServiceTableStatus, ServiceTableVM } from './service.types';
import type { Zone } from '@/types/admin.types';

const STATUS_DOT: Record<ServiceTableStatus, string> = {
  free: 'bg-status-success',
  occupied: 'bg-status-info',
  // reserved / cleaning: retained in the type but not surfaced until backend support.
  reserved: 'bg-status-warning',
  cleaning: 'bg-status-error',
};

const ZONE_DOT_COLORS = [
  'bg-status-success',
  'bg-status-info',
  'bg-status-warning',
  'bg-accent',
  'bg-status-error',
];

interface Props {
  zones: Zone[];
  tables: ServiceTableVM[];
  serverById: Map<string, ServiceServerVM>;
  activeZoneId: string | null;
  statusFilters: Set<ServiceTableStatus>;
  search: string;
  viewMode: 'grid' | 'plan';
  selectedId: string | null;
  dragOverId: string | null;
  highlightServerId: string | null;
  onClearHighlight: () => void;
  planEditMode: boolean;
  planPositions: PlanPositions;
  onTogglePlanEdit: () => void;
  onPlanPositionChange: (tableId: string, position: PlanPosition) => void;
  onPlanResetPositions: () => void;
  labels: {
    allTab: string;
    gridMode: string;
    planMode: string;
    searchPlaceholder: string;
    free: string;
    occupied: string;
    reserved: string;
    cleaning: string;
    noTablesMatch: string;
    seatsShort: string;
    emptyServerDropHint: string;
    emptyServerCleaningHint: string;
    emptyServerReserved: string;
    sinceSince: string;
    occupiedSummary: string;
    freeSummary: string;
    reservedSummary: string;
    releaseAria: string;
    filteredByServerLabel: (name: string) => string;
    clearFilterAria: string;
    planSelectZone: string;
    roomPlanLabel: string;
    editLayout: string;
    exitEditLayout: string;
    resetLayout: string;
    editModeHint: string;
  };
  onZoneChange: (zoneId: string | null) => void;
  onToggleStatusFilter: (status: ServiceTableStatus) => void;
  onSearch: (value: string) => void;
  onViewMode: (mode: 'grid' | 'plan') => void;
  onSelect: (tableId: string) => void;
  onRelease: (assignmentId: string) => void;
  onDragOver: (tableId: string) => void;
  onDragLeave: (tableId: string) => void;
  onDrop: (tableId: string, serverId: string) => void;
}

export function ServiceFloorPlan({
  zones,
  tables,
  serverById,
  activeZoneId,
  statusFilters,
  search,
  viewMode,
  selectedId,
  dragOverId,
  highlightServerId,
  onClearHighlight,
  planEditMode,
  planPositions,
  onTogglePlanEdit,
  onPlanPositionChange,
  onPlanResetPositions,
  labels,
  onZoneChange,
  onToggleStatusFilter,
  onSearch,
  onViewMode,
  onSelect,
  onRelease,
  onDragOver,
  onDragLeave,
  onDrop,
}: Props) {
  const countsByZone: Record<string, { occ: number; total: number }> = {};
  for (const z of zones) {
    const zoneTables = tables.filter((t) => t.table.zone_id === z.id);
    countsByZone[z.id] = {
      total: zoneTables.length,
      occ: zoneTables.filter((t) => t.status === 'occupied').length,
    };
  }
  const globalOcc = tables.filter((t) => t.status === 'occupied').length;

  const filtered = tables.filter((t) => {
    if (highlightServerId && t.assignment?.server_id !== highlightServerId) return false;
    if (statusFilters.size > 0 && !statusFilters.has(t.status)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const label = (t.table.display_name || t.table.table_number || '').toLowerCase();
      if (!label.includes(q)) return false;
    }
    return true;
  });

  const highlightedServer = highlightServerId ? serverById.get(highlightServerId) : undefined;

  const zonesToShow = activeZoneId ? zones.filter((z) => z.id === activeZoneId) : zones;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* Room tabs */}
      <div className="flex items-center gap-0.5 overflow-x-auto border-b border-app-border/50 bg-app-bg px-[18px] pt-2.5 [scrollbar-width:none]">
        <RoomTab
          active={!activeZoneId}
          onClick={() => onZoneChange(null)}
          label={labels.allTab}
          count={`${globalOcc}/${tables.length}`}
        />
        {zones.map((zone, idx) => (
          <RoomTab
            key={zone.id}
            active={activeZoneId === zone.id}
            onClick={() => onZoneChange(activeZoneId === zone.id ? null : zone.id)}
            label={zone.name}
            dotClass={ZONE_DOT_COLORS[idx % ZONE_DOT_COLORS.length]}
            count={
              countsByZone[zone.id]
                ? `${countsByZone[zone.id].occ}/${countsByZone[zone.id].total}`
                : undefined
            }
          />
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-app-border/50 bg-app-card px-[18px] py-2.5">
        <div className="relative flex shrink-0 items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-app-text-muted" />
          <Input
            data-service-search-input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={labels.searchPlaceholder}
            className="h-8 w-[220px] border-app-border bg-app-bg pl-8 text-xs"
          />
        </div>

        <div className="flex flex-1 basis-0 flex-wrap items-center gap-1.5 min-w-[200px]">
          <FilterChip
            active={statusFilters.has('free')}
            onClick={() => onToggleStatusFilter('free')}
            dotClass={STATUS_DOT.free}
            label={labels.free}
          />
          <FilterChip
            active={statusFilters.has('occupied')}
            onClick={() => onToggleStatusFilter('occupied')}
            dotClass={STATUS_DOT.occupied}
            label={labels.occupied}
          />
        </div>

        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-1.5">
          <div className="flex overflow-hidden rounded border border-app-border">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onViewMode('grid')}
              className={cn(
                'h-auto flex items-center gap-1.5 rounded-none border-r border-app-border px-2.5 py-1.5 text-[11px]',
                viewMode === 'grid'
                  ? 'bg-app-elevated text-app-text'
                  : 'text-app-text-muted hover:bg-app-hover',
              )}
            >
              <LayoutGrid className="h-3 w-3" />
              {labels.gridMode}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onViewMode('plan')}
              className={cn(
                'h-auto flex items-center gap-1.5 rounded-none px-2.5 py-1.5 text-[11px]',
                viewMode === 'plan'
                  ? 'bg-app-elevated text-app-text'
                  : 'text-app-text-muted hover:bg-app-hover',
              )}
            >
              <Map className="h-3 w-3" />
              {labels.planMode}
            </Button>
          </div>

          {viewMode === 'plan' && activeZoneId && (
            <>
              <Button
                type="button"
                variant={planEditMode ? 'default' : 'outline'}
                onClick={onTogglePlanEdit}
                className={cn(
                  'h-8 gap-1.5 px-3 text-xs',
                  planEditMode && 'bg-accent text-accent-text hover:bg-accent/90',
                )}
              >
                <Move className="h-3 w-3" />
                {planEditMode ? labels.exitEditLayout : labels.editLayout}
              </Button>
              {planEditMode && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onPlanResetPositions}
                  title={labels.resetLayout}
                  aria-label={labels.resetLayout}
                  className="h-8 w-8 p-0"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Highlight banner */}
      {highlightedServer && (
        <div className="flex items-center justify-between border-b border-accent/40 bg-accent-muted/30 px-[18px] py-1.5 text-[11px] text-app-text">
          <span>{labels.filteredByServerLabel(highlightedServer.server.full_name ?? '-')}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearHighlight}
            aria-label={labels.clearFilterAria}
            className="h-6 gap-1 px-2 text-[11px]"
          >
            <CloseIcon className="h-3 w-3" />
            {labels.clearFilterAria}
          </Button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-auto bg-app-card p-[18px] [scrollbar-width:none]">
        {viewMode === 'plan' ? (
          !activeZoneId ? (
            <div className="rounded border border-dashed border-app-border px-4 py-10 text-center text-[11px] text-app-text-muted">
              {labels.planSelectZone}
            </div>
          ) : (
            (() => {
              const zone = zones.find((z) => z.id === activeZoneId);
              const zoneTables = filtered.filter((t) => t.table.zone_id === activeZoneId);
              if (!zone || zoneTables.length === 0) {
                return (
                  <div className="rounded border border-dashed border-app-border px-4 py-6 text-center text-[11px] text-app-text-muted">
                    {labels.noTablesMatch}
                  </div>
                );
              }
              return (
                <ServicePlan2D
                  zoneName={zone.name}
                  tables={zoneTables}
                  selectedId={selectedId}
                  dragOverId={dragOverId}
                  serverById={serverById}
                  editMode={planEditMode}
                  positions={planPositions}
                  onPositionChange={onPlanPositionChange}
                  labels={labels}
                  onSelect={onSelect}
                  onRelease={onRelease}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                />
              );
            })()
          )
        ) : filtered.length === 0 ? (
          <div className="rounded border border-dashed border-app-border px-4 py-6 text-center text-[11px] text-app-text-muted">
            {labels.noTablesMatch}
          </div>
        ) : (
          zonesToShow.map((zone, idx) => {
            const zoneTables = filtered.filter((t) => t.table.zone_id === zone.id);
            if (zoneTables.length === 0) return null;
            return (
              <ServiceRoomSection
                key={zone.id}
                zoneName={zone.name}
                zoneTag={zone.description || null}
                swatchClass={ZONE_DOT_COLORS[idx % ZONE_DOT_COLORS.length]}
                tables={zoneTables}
                selectedId={selectedId}
                dragOverId={dragOverId}
                serverById={serverById}
                labels={labels}
                onSelect={onSelect}
                onRelease={onRelease}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
              />
            );
          })
        )}
      </div>
    </section>
  );
}

function RoomTab({
  active,
  onClick,
  label,
  count,
  dotClass,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: string;
  dotClass?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn(
        'h-auto relative top-px flex items-center gap-2 rounded-none rounded-t-sm border border-b-0 border-transparent px-3.5 py-2 text-xs whitespace-nowrap transition-colors',
        active
          ? 'border-app-border bg-app-card text-app-text'
          : 'text-app-text-muted hover:text-app-text',
      )}
    >
      {dotClass && <span className={cn('h-1.5 w-1.5 rounded-full', dotClass)} />}
      {label}
      {count && (
        <span
          className={cn(
            'rounded-sm px-1.5 py-px font-mono text-[10px]',
            active ? 'bg-app-elevated text-app-text-secondary' : 'bg-app-bg text-app-text-muted',
          )}
        >
          {count}
        </span>
      )}
    </Button>
  );
}

function FilterChip({
  active,
  onClick,
  dotClass,
  label,
}: {
  active: boolean;
  onClick: () => void;
  dotClass: string;
  label: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn(
        'h-auto inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-[11px] whitespace-nowrap transition-colors',
        active
          ? 'border-app-border bg-app-elevated text-app-text'
          : 'border-app-border/60 text-app-text-muted hover:bg-app-hover hover:text-app-text',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dotClass)} />
      {label}
    </Button>
  );
}
