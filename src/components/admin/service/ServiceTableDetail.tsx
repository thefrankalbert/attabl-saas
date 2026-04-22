'use client';

import { useEffect } from 'react';
import { X as CloseIcon } from 'lucide-react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatInitials, formatTimeHHMM } from './service-status';
import type { ServiceServerVM, ServiceTableStatus, ServiceTableVM } from './service.types';
import type { Order } from '@/types/admin.types';

interface Props {
  vm: ServiceTableVM | null;
  servers: ServiceServerVM[];
  currentOrder: Order | null;
  currencySymbol: string;
  onClose: () => void;
  onAssignServer: (tableId: string, serverId: string) => void;
  onRelease: (assignmentId: string) => void;
  labels: {
    closeAria: string;
    tableLabel: string;
    seatsLabel: string;
    statusFree: string;
    statusOccupied: string;
    infoSection: string;
    roomLabel: string;
    seatsRow: string;
    arrivalRow: string;
    assignedServerSection: string;
    noServerAssigned: string;
    selectServer: string;
    releaseBtn: string;
    currentOrderSection: string;
    orderEmpty: string;
    orderOpened: string;
    orderTotal: string;
  };
}

const STATUSES: Array<{ key: ServiceTableStatus; dotClass: string }> = [
  { key: 'free', dotClass: 'bg-status-success' },
  { key: 'occupied', dotClass: 'bg-status-info' },
];

export function ServiceTableDetail({
  vm,
  servers,
  currentOrder,
  currencySymbol,
  onClose,
  onAssignServer,
  onRelease,
  labels,
}: Props) {
  useEffect(() => {
    if (!vm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [vm, onClose]);

  if (!vm) return null;

  const { table, zone, status, assignment } = vm;
  const assignedServer = assignment
    ? servers.find((s) => s.server.id === assignment.server_id)
    : undefined;

  const statusLabelMap: Record<ServiceTableStatus, string> = {
    free: labels.statusFree,
    occupied: labels.statusOccupied,
    reserved: labels.statusOccupied,
    cleaning: labels.statusOccupied,
  };

  const orderTotal = currentOrder
    ? (currentOrder.items ?? []).reduce((sum, it) => sum + (it.price ?? 0) * (it.quantity ?? 0), 0)
    : 0;

  return (
    <>
      <div
        role="presentation"
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/50 animate-in fade-in duration-150"
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="service-table-detail-title"
        className={cn(
          'fixed inset-y-0 right-0 z-[51] flex w-full max-w-[440px] flex-col',
          'border-l border-app-border bg-app-card',
          'animate-in slide-in-from-right duration-200',
        )}
      >
        <div className="border-b border-app-border/50 p-[18px]">
          <div className="mb-3.5 flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-[1.2px] text-app-text-muted">
              {zone?.name ?? '-'}
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              aria-label={labels.closeAria}
              className="h-7 w-7 grid place-items-center rounded border border-app-border text-app-text-secondary hover:bg-app-hover hover:text-app-text p-0"
            >
              <CloseIcon className="h-3 w-3" />
            </Button>
          </div>
          <div id="service-table-detail-title" className="flex items-baseline gap-2.5">
            <span className="font-mono text-[22px] font-normal tracking-tight text-app-text">
              {labels.tableLabel} {table.display_name || table.table_number}
            </span>
            <span className="font-mono text-xs text-app-text-muted">
              {table.capacity} {labels.seatsLabel}
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <span
                key={s.key}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-[11px] font-normal',
                  status === s.key
                    ? 'border-app-border bg-app-elevated text-app-text'
                    : 'border-app-border text-app-text-muted opacity-60',
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', s.dotClass)} />
                {statusLabelMap[s.key]}
              </span>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-[18px]">
          <Section title={labels.infoSection}>
            <FieldRow label={labels.roomLabel} value={zone?.name ?? '-'} />
            <FieldRow label={labels.seatsRow} value={String(table.capacity)} />
            <FieldRow label={labels.statusFree} value={statusLabelMap[status]} />
            {assignment && (
              <FieldRow label={labels.arrivalRow} value={formatTimeHHMM(assignment.started_at)} />
            )}
          </Section>

          <Section title={labels.assignedServerSection}>
            {assignedServer ? (
              <div className="flex items-center gap-2.5 rounded border border-app-border bg-app-elevated p-2.5">
                <div className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full border border-app-border bg-app-bg text-[11px] font-bold text-app-text-secondary">
                  {formatInitials(assignedServer.server.full_name)}
                  <span className="absolute -right-0.5 -bottom-0.5 h-[9px] w-[9px] rounded-full border-2 border-app-elevated bg-status-info" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-normal text-app-text">
                    {assignedServer.server.full_name ?? '-'}
                  </div>
                  <div className="text-[10px] text-app-text-muted">
                    {assignedServer.server.role}
                  </div>
                </div>
                {assignment && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onRelease(assignment.id)}
                    className="h-7 text-[11px] text-status-error hover:bg-status-error/10 hover:text-status-error"
                  >
                    {labels.releaseBtn}
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="mb-2 rounded border border-dashed border-app-border px-4 py-4 text-center text-[11px] text-app-text-muted">
                  {labels.noServerAssigned}
                </div>
                <Select onValueChange={(val) => onAssignServer(table.id, val)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={labels.selectServer} />
                  </SelectTrigger>
                  <SelectContent>
                    {servers
                      .filter((s) => s.status !== 'break')
                      .map((s) => (
                        <SelectItem key={s.server.id} value={s.server.id}>
                          {s.server.full_name ?? '-'}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </Section>

          <Section title={labels.currentOrderSection}>
            {currentOrder ? (
              <>
                <div className="mb-1.5 flex items-center justify-between text-[11px] text-app-text-muted">
                  <span>
                    {labels.orderOpened} {formatTimeHHMM(currentOrder.created_at)}
                  </span>
                  {currentOrder.order_number && (
                    <span className="font-mono text-[10px] text-app-text-muted">
                      {currentOrder.order_number}
                    </span>
                  )}
                </div>
                <div className="rounded border border-app-border bg-app-elevated">
                  {(currentOrder.items ?? []).map((item, idx) => (
                    <div
                      key={item.id ?? idx}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] not-first:border-t not-first:border-app-border/60"
                    >
                      <div className="min-w-0 flex-1 truncate text-app-text">
                        <span className="font-mono text-app-text-muted">x{item.quantity}</span>{' '}
                        {item.name}
                      </div>
                      <span className="font-mono text-app-text">
                        {(item.price * item.quantity).toFixed(2)} {currencySymbol}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex items-center justify-between rounded bg-app-elevated px-3 py-2 text-[12px]">
                  <span className="text-app-text-muted">{labels.orderTotal}</span>
                  <span className="font-mono font-bold text-app-text">
                    {orderTotal.toFixed(2)} {currencySymbol}
                  </span>
                </div>
              </>
            ) : (
              <div className="rounded border border-dashed border-app-border px-4 py-4 text-center text-[11px] text-app-text-muted">
                {labels.orderEmpty}
              </div>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <h3 className="mb-2.5 text-[10px] font-bold uppercase tracking-[1.2px] text-app-text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-app-border/30 py-1.5 text-[11px] last:border-0">
      <span className="text-app-text-muted">{label}</span>
      <span className="font-normal text-app-text">{value}</span>
    </div>
  );
}
