'use client';

import { useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { CheckCircle2, GripVertical, Users, Utensils } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatInitials, formatTimeHHMM, getElapsedMinutes } from './service-status';
import type { ServiceServerStatus, ServiceServerVM } from './service.types';
import type { Order } from '@/types/admin.types';

type Tab = 'servers' | 'orders';

interface Props {
  servers: ServiceServerVM[];
  readyOrders: Order[];
  now: number;
  highlightServerId: string | null;
  labels: {
    tabServers: string;
    tabOrders: string;
    inService: string;
    available: string;
    onBreak: string;
    availableStateEmpty: string;
    inServiceEmpty: string;
    ordersTitle: string;
    ordersEmpty: string;
    dragHint: string;
    markDelivered: string;
    tableShort: string;
    itemsCount: (count: number) => string;
    minutesAgoShort: (min: number) => string;
    roleLabel: string;
    availableStatus: string;
    tablesPlural: (n: number) => string;
  };
  onDragStartServer: (serverId: string) => void;
  onDragEndServer: () => void;
  onHighlightServer: (serverId: string | null) => void;
  onMarkDelivered: (orderId: string) => void;
}

export function ServiceRightPanel({
  servers,
  readyOrders,
  now,
  highlightServerId,
  labels,
  onDragStartServer,
  onDragEndServer,
  onHighlightServer,
  onMarkDelivered,
}: Props) {
  const [tab, setTab] = useState<Tab>('servers');

  const groups = useMemo(() => {
    const inService: ServiceServerVM[] = [];
    const available: ServiceServerVM[] = [];
    const onBreak: ServiceServerVM[] = [];
    for (const vm of servers) {
      if (vm.status === 'busy') inService.push(vm);
      else if (vm.status === 'online') available.push(vm);
      else onBreak.push(vm);
    }
    return { inService, available, onBreak };
  }, [servers]);

  return (
    <aside className="flex min-h-0 w-[280px] shrink-0 flex-col border-l border-app-border/50 bg-app-card xl:w-[320px]">
      <div className="flex gap-0.5 border-b border-app-border/50 px-2 pt-2.5">
        <TabBtn active={tab === 'servers'} onClick={() => setTab('servers')}>
          {labels.tabServers}
          <Count active={tab === 'servers'}>{servers.length}</Count>
        </TabBtn>
        <TabBtn active={tab === 'orders'} onClick={() => setTab('orders')}>
          {labels.tabOrders}
          <Count active={tab === 'orders'}>{readyOrders.length}</Count>
        </TabBtn>
      </div>

      <div className="flex-1 overflow-y-auto bg-app-bg p-3.5 [scrollbar-width:none]">
        {tab === 'servers' && (
          <>
            <SubHead label={labels.inService} count={groups.inService.length} />
            {groups.inService.length === 0 ? (
              <EmptyState>{labels.inServiceEmpty}</EmptyState>
            ) : (
              groups.inService.map((vm) => (
                <ServerCard
                  key={vm.server.id}
                  vm={vm}
                  labels={labels}
                  highlighted={highlightServerId === vm.server.id}
                  onDragStart={() => onDragStartServer(vm.server.id)}
                  onDragEnd={onDragEndServer}
                  onHighlight={onHighlightServer}
                />
              ))
            )}

            <SubHead label={labels.available} count={groups.available.length} />
            {groups.available.length === 0 ? (
              <EmptyState>{labels.availableStateEmpty}</EmptyState>
            ) : (
              groups.available.map((vm) => (
                <ServerCard
                  key={vm.server.id}
                  vm={vm}
                  labels={labels}
                  highlighted={highlightServerId === vm.server.id}
                  onDragStart={() => onDragStartServer(vm.server.id)}
                  onDragEnd={onDragEndServer}
                  onHighlight={onHighlightServer}
                />
              ))
            )}

            {groups.onBreak.length > 0 && (
              <>
                <SubHead label={labels.onBreak} count={groups.onBreak.length} />
                {groups.onBreak.map((vm) => (
                  <ServerCard
                    key={vm.server.id}
                    vm={vm}
                    labels={labels}
                    highlighted={highlightServerId === vm.server.id}
                    onDragStart={() => onDragStartServer(vm.server.id)}
                    onDragEnd={onDragEndServer}
                    onHighlight={onHighlightServer}
                  />
                ))}
              </>
            )}

            <div className="mt-4 rounded border border-dashed border-app-border px-2.5 py-2.5 text-center text-[11px] text-app-text-muted">
              {labels.dragHint}
            </div>
          </>
        )}

        {tab === 'orders' && (
          <>
            <SubHead label={labels.ordersTitle} count={readyOrders.length} />
            {readyOrders.length === 0 ? (
              <EmptyState>{labels.ordersEmpty}</EmptyState>
            ) : (
              readyOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  now={now}
                  labels={labels}
                  onMarkDelivered={onMarkDelivered}
                />
              ))
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn(
        'h-auto relative top-px flex items-center gap-1.5 rounded-none rounded-t-sm border border-b-0 border-transparent px-3 py-2 text-xs',
        active
          ? 'border-app-border/50 bg-app-bg text-app-text'
          : 'text-app-text-muted hover:text-app-text',
      )}
    >
      {children}
    </Button>
  );
}

function Count({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'rounded-sm px-1.5 py-px font-mono text-[10px]',
        active ? 'bg-app-elevated text-app-text-secondary' : 'bg-app-elevated text-app-text-muted',
      )}
    >
      {children}
    </span>
  );
}

function SubHead({ label, count }: { label: string; count: number }) {
  return (
    <div className="mt-1.5 mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[1.2px] text-app-text-muted first:mt-0">
      <span>{label}</span>
      <span className="font-mono font-medium tracking-[0.5px] text-app-text-secondary">
        {count}
      </span>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-1.5 rounded border border-dashed border-app-border px-4 py-6 text-center text-[11px] text-app-text-muted">
      {children}
    </div>
  );
}

function ServerCard({
  vm,
  labels,
  highlighted,
  onDragStart,
  onDragEnd,
  onHighlight,
}: {
  vm: ServiceServerVM;
  labels: Props['labels'];
  highlighted: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onHighlight: (serverId: string | null) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const initials = formatInitials(vm.server.full_name);
  const canHighlight = vm.assignedTables.length > 0;
  const handleStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('text/server-id', vm.server.id);
    e.dataTransfer.effectAllowed = 'move';
    setDragging(true);
    onDragStart();
  };
  const handleEnd = () => {
    setDragging(false);
    onDragEnd();
  };
  const handleClick = () => {
    if (!canHighlight) return;
    onHighlight(highlighted ? null : vm.server.id);
  };
  return (
    <div
      draggable
      onDragStart={handleStart}
      onDragEnd={handleEnd}
      onClick={handleClick}
      role={canHighlight ? 'button' : undefined}
      tabIndex={canHighlight ? 0 : undefined}
      onKeyDown={
        canHighlight
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
      className={cn(
        'mb-1.5 flex cursor-grab items-center gap-2.5 rounded border p-2.5 transition-colors active:cursor-grabbing',
        highlighted
          ? 'border-accent bg-accent-muted/30 ring-1 ring-accent ring-inset'
          : 'border-app-border bg-app-elevated hover:border-app-border hover:bg-app-hover',
        dragging && 'opacity-50',
      )}
    >
      <div className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full border border-app-border bg-app-bg text-[11px] font-semibold text-app-text-secondary">
        {initials}
        <span
          className={cn(
            'absolute -right-0.5 -bottom-0.5 h-[9px] w-[9px] rounded-full border-2 border-app-elevated',
            STATUS_BADGE[vm.status],
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-app-text">
          {vm.server.full_name ?? '-'}
        </div>
        <div className="font-mono text-[10px] text-app-text-muted">
          {vm.assignedTables.length === 0
            ? labels.availableStatus
            : labels.tablesPlural(vm.assignedTables.length)}
          {' · '}
          {vm.server.role}
        </div>
        {vm.assignedTables.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {vm.assignedTables.map((t) => (
              <span
                key={t}
                className="rounded-sm bg-app-bg px-1.5 py-0.5 font-mono text-[9px] text-app-text-secondary"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      <GripVertical className="h-3 w-3 shrink-0 text-app-text-muted" aria-hidden />
    </div>
  );
}

const STATUS_BADGE: Record<ServiceServerStatus, string> = {
  online: 'bg-status-success',
  busy: 'bg-status-info',
  break: 'bg-status-warning',
};

function OrderCard({
  order,
  now,
  labels,
  onMarkDelivered,
}: {
  order: Order;
  now: number;
  labels: Props['labels'];
  onMarkDelivered: (orderId: string) => void;
}) {
  const items = order.items ?? [];
  const minutes = getElapsedMinutes(order.created_at, now);
  return (
    <div className="mb-1.5 rounded border border-app-border bg-app-elevated p-2.5">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-app-text">
          <Utensils className="h-3 w-3 text-status-warning" />
          <span className="font-mono">
            {labels.tableShort} {order.table_number}
          </span>
        </div>
        <span className="font-mono text-[10px] text-app-text-muted">
          {formatTimeHHMM(order.created_at)}
        </span>
      </div>
      <div className="mb-2 text-[11px] leading-[1.5] text-app-text-secondary">
        {items.slice(0, 3).map((it, k) => (
          <div key={k}>
            <span className="font-mono text-app-text-muted">x{it.quantity}</span> {it.name}
          </div>
        ))}
        {items.length > 3 && (
          <div className="text-[10px] text-app-text-muted">+{items.length - 3}</div>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-dashed border-app-border/60 pt-2">
        <span className="flex items-center gap-1.5">
          <span className="rounded-sm bg-status-warning/15 px-1.5 py-px text-[9px] font-semibold tracking-wide uppercase text-status-warning">
            {labels.itemsCount(items.length)}
          </span>
          <span className="font-mono text-[10px] text-app-text-muted">
            {labels.minutesAgoShort(minutes)}
          </span>
        </span>
        <Button
          type="button"
          size="sm"
          onClick={() => onMarkDelivered(order.id)}
          className="h-7 gap-1 bg-status-success px-2.5 text-[11px] font-semibold text-white hover:bg-status-success/90"
        >
          <CheckCircle2 className="h-3 w-3" />
          {labels.markDelivered}
        </Button>
      </div>
    </div>
  );
}

export { Users };
