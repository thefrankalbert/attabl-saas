'use client';

import { cn } from '@/lib/utils';
import { ServiceTableCard } from './ServiceTableCard';
import type { ServiceServerVM, ServiceTableVM } from './service.types';

interface Props {
  zoneName: string;
  zoneTag?: string | null;
  swatchClass: string;
  tables: ServiceTableVM[];
  selectedId: string | null;
  dragOverId: string | null;
  serverById: Map<string, ServiceServerVM>;
  labels: {
    free: string;
    occupied: string;
    reserved: string;
    cleaning: string;
    seatsShort: string;
    emptyServerDropHint: string;
    emptyServerCleaningHint: string;
    emptyServerReserved: string;
    sinceSince: string;
    occupiedSummary: string;
    freeSummary: string;
    reservedSummary: string;
    releaseAria: string;
  };
  onSelect: (tableId: string) => void;
  onRelease: (assignmentId: string) => void;
  onDragOver: (tableId: string) => void;
  onDragLeave: (tableId: string) => void;
  onDrop: (tableId: string, serverId: string) => void;
}

export function ServiceRoomSection({
  zoneName,
  zoneTag,
  swatchClass,
  tables,
  selectedId,
  dragOverId,
  serverById,
  labels,
  onSelect,
  onRelease,
  onDragOver,
  onDragLeave,
  onDrop,
}: Props) {
  const total = tables.length;
  const occ = tables.filter((t) => t.status === 'occupied').length;
  const free = tables.filter((t) => t.status === 'free').length;
  const reserved = tables.filter((t) => t.status === 'reserved').length;

  return (
    <section className="mb-6 last:mb-0">
      <header className="mb-2.5 flex items-baseline justify-between border-b border-app-border/50 pb-2">
        <div className="flex items-center gap-2.5 text-[13px] font-bold text-app-text">
          <span className={cn('block h-3.5 w-[3px]', swatchClass)} aria-hidden />
          <span>{zoneName}</span>
          {zoneTag && (
            <span className="text-[11px] font-normal text-app-text-muted">{zoneTag}</span>
          )}
        </div>
        <div className="font-mono text-[11px] text-app-text-muted">
          {occ}/{total} {labels.occupiedSummary} · {free} {labels.freeSummary}
          {reserved > 0 && ` · ${reserved} ${labels.reservedSummary}`}
        </div>
      </header>

      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(168px,1fr))]">
        {tables.map((vm) => (
          <ServiceTableCard
            key={vm.table.id}
            vm={vm}
            selected={selectedId === vm.table.id}
            dragOver={dragOverId === vm.table.id}
            serverVM={vm.assignment ? serverById.get(vm.assignment.server_id) : undefined}
            labels={labels}
            onSelect={onSelect}
            onRelease={onRelease}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          />
        ))}
      </div>
    </section>
  );
}
