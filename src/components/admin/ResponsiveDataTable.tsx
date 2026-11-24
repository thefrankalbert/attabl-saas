'use client';

import { useSyncExternalStore } from 'react';
import { useDevice } from '@/hooks/useDevice';
import { createMediaStore } from '@/contexts/DeviceContext';
import { MEDIA_QUERIES } from '@/lib/layout/breakpoints';
import { DataTable, SortableHeader } from '@/components/admin/DataTable';
import type { ColumnDef, VisibilityState } from '@tanstack/react-table';

// Tableaux trop larges pour une tablette (inventaire: 900 px pour 660 de
// place a 1024): cartes jusqu'a xl au lieu d'un tableau coupe a droite.
const belowXlStore = createMediaStore(MEDIA_QUERIES.belowXl);

// --- Types ----------------------------------------------

interface MobileCardConfig<TData> {
  /** Render a single card for a data row */
  renderCard: (row: TData, index: number) => React.ReactNode;
}

interface ResponsiveDataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  pageSize?: number;
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: TData) => void;
  /** When provided, renders cards on mobile instead of the table */
  mobileConfig?: MobileCardConfig<TData>;
  /** When provided, sorting state is persisted to sessionStorage */
  storageKey?: string;
  /** Column visibility map - hide specific columns on certain screen sizes */
  columnVisibility?: VisibilityState;
  /** Cartes aussi sur tablette et petit ordinateur (< 1280 px), pour un tableau trop large. */
  cardsBelowXl?: boolean;
}

// --- Component ------------------------------------------

export function ResponsiveDataTable<TData>({
  columns,
  data,
  pageSize,
  isLoading,
  emptyMessage,
  onRowClick,
  mobileConfig,
  storageKey,
  columnVisibility,
  cardsBelowXl = false,
}: ResponsiveDataTableProps<TData>) {
  const { isMobile } = useDevice();
  const belowXl = useSyncExternalStore(
    belowXlStore.subscribe,
    belowXlStore.getSnapshot,
    belowXlStore.getServerSnapshot,
  );

  // Mobile card view
  if ((isMobile || (cardsBelowXl && belowXl)) && mobileConfig) {
    if (isLoading) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-app-elevated rounded-xl h-24" />
          ))}
        </div>
      );
    }

    if (data.length === 0) {
      return <div className="text-center py-12 text-app-text-muted text-sm">{emptyMessage}</div>;
    }

    return (
      <div className="space-y-3" data-testid="responsive-cards">
        {data.map((row, i) => (
          <div
            key={i}
            onClick={() => onRowClick?.(row)}
            className={onRowClick ? 'cursor-pointer' : undefined}
          >
            {mobileConfig.renderCard(row, i)}
          </div>
        ))}
      </div>
    );
  }

  // Tablet + Desktop: standard DataTable
  return (
    <DataTable
      columns={columns}
      data={data}
      pageSize={pageSize}
      isLoading={isLoading}
      emptyMessage={emptyMessage}
      onRowClick={onRowClick}
      storageKey={storageKey}
      columnVisibility={columnVisibility}
    />
  );
}

export { SortableHeader };
