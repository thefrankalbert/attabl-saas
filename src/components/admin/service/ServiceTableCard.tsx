'use client';

import type { DragEvent, KeyboardEvent, MouseEvent } from 'react';
import { X as CloseIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatTimeHHMM } from './service-status';
import type { ServiceServerVM, ServiceTableStatus, ServiceTableVM } from './service.types';

interface Props {
  vm: ServiceTableVM;
  selected: boolean;
  dragOver: boolean;
  serverVM: ServiceServerVM | undefined;
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
    releaseAria: string;
  };
  onSelect: (tableId: string) => void;
  onRelease: (assignmentId: string) => void;
  onDragOver: (tableId: string) => void;
  onDragLeave: (tableId: string) => void;
  onDrop: (tableId: string, serverId: string) => void;
}

const STRIPE_CLASS: Record<ServiceTableStatus, string> = {
  free: 'bg-status-success',
  occupied: 'bg-status-info',
  reserved: 'bg-status-warning',
  cleaning: 'bg-status-error',
};

const STATUS_TEXT_CLASS: Record<ServiceTableStatus, string> = {
  free: 'text-status-success',
  occupied: 'text-status-info',
  reserved: 'text-status-warning',
  cleaning: 'text-status-error',
};

function statusLabel(status: ServiceTableStatus, labels: Props['labels']): string {
  switch (status) {
    case 'free':
      return labels.free;
    case 'occupied':
      return labels.occupied;
    case 'reserved':
      return labels.reserved;
    case 'cleaning':
      return labels.cleaning;
  }
}

export function ServiceTableCard({
  vm,
  selected,
  dragOver,
  serverVM,
  labels,
  onSelect,
  onRelease,
  onDragOver,
  onDragLeave,
  onDrop,
}: Props) {
  const { table, status, assignment, since } = vm;
  const displayId = table.display_name || table.table_number;
  const sinceLabel =
    since && status === 'occupied'
      ? `${labels.occupied} · ${labels.sinceSince} ${formatTimeHHMM(since)}`
      : statusLabel(status, labels);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    onDragOver(table.id);
  };
  const handleDragLeave = () => onDragLeave(table.id);
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const serverId = e.dataTransfer.getData('text/server-id');
    onDragLeave(table.id);
    if (serverId) onDrop(table.id, serverId);
  };

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(table.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onSelect(table.id)}
      onKeyDown={handleKey}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'group relative flex flex-col justify-between min-h-[88px] px-4 py-3 pl-4',
        'bg-app-card border rounded transition-colors cursor-pointer overflow-hidden',
        'hover:bg-app-hover hover:border-app-border/80',
        'focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent',
        selected
          ? 'border-accent bg-app-elevated ring-1 ring-accent ring-inset'
          : 'border-app-border',
        dragOver && 'border-accent bg-accent-muted/30',
      )}
    >
      {/* Left status stripe */}
      <span
        aria-hidden
        className={cn('absolute left-0 top-0 bottom-0 w-[3px]', STRIPE_CLASS[status])}
      />

      {/* Head: id + seats + quick release */}
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[13px] font-semibold tracking-tight text-app-text">
          {displayId}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] tracking-wide text-app-text-muted">
            {table.capacity} {labels.seatsShort}
          </span>
          {assignment && (
            <Button
              type="button"
              variant="ghost"
              aria-label={labels.releaseAria}
              onClick={(e: MouseEvent<HTMLButtonElement>) => {
                e.stopPropagation();
                onRelease(assignment.id);
              }}
              className="h-5 w-5 shrink-0 p-0 grid place-items-center rounded text-app-text-muted opacity-0 transition-opacity hover:bg-status-error/10 hover:text-status-error group-hover:opacity-100 focus-visible:opacity-100"
            >
              <CloseIcon className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Status line */}
      <div className={cn('mt-0.5 text-[11px] font-medium', STATUS_TEXT_CLASS[status])}>
        {sinceLabel}
      </div>

      {/* Meta: server or placeholder + time */}
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-app-text-secondary">
        {status === 'free' || status === 'cleaning' || !assignment ? (
          <span className="text-[10px] italic text-app-text-muted">
            {status === 'cleaning'
              ? labels.emptyServerCleaningHint
              : status === 'reserved'
                ? labels.emptyServerReserved
                : labels.emptyServerDropHint}
          </span>
        ) : (
          <ServerMini vm={serverVM} />
        )}
        {since && status === 'occupied' && (
          <span className="shrink-0 font-mono text-[10px] text-app-text-muted">
            {formatTimeHHMM(since)}
          </span>
        )}
      </div>
    </div>
  );
}

function ServerMini({ vm }: { vm: ServiceServerVM | undefined }) {
  if (!vm) {
    return <span className="text-[10px] italic text-app-text-muted">-</span>;
  }
  const firstName = (vm.server.full_name ?? '').split(' ')[0] || '-';
  const initials =
    (vm.server.full_name ?? '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?';
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <div className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-app-border bg-app-elevated text-[8px] font-semibold text-app-text-secondary">
        {initials}
      </div>
      <span className="truncate text-app-text-secondary">{firstName}</span>
    </div>
  );
}
