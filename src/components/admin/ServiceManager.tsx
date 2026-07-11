'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { createOrderService } from '@/services/order.service';
import {
  createServiceManagerService,
  type OpenTableSession,
} from '@/services/service-manager.service';
import { actionUpdateOrderStatus } from '@/app/actions/orders';
import { useAssignments } from '@/hooks/queries/useAssignments';
import { useAssignServer, useReleaseAssignment } from '@/hooks/mutations/useAssignment';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useContextualShortcuts } from '@/hooks/useContextualShortcuts';
import type { ShortcutDefinition } from '@/hooks/useKeyboardShortcuts';
import { useToast } from '@/components/ui/use-toast';
import { logger } from '@/lib/logger';
import { ServiceMetricsBar } from './service/ServiceMetricsBar';
import { ServiceFloorPlan } from './service/ServiceFloorPlan';
import { ServiceRightPanel } from './service/ServiceRightPanel';
import { ServiceTableDetail } from './service/ServiceTableDetail';
import { ServiceMobileOrders } from './service/ServiceMobileOrders';
import { usePlanPositions } from './service/use-plan-positions';
import { useServiceLabels } from './service/use-service-labels';
import { ServiceManagerSkeleton } from './service/ServiceManagerSkeleton';
import { buildServerVMs, buildTableVMs, getElapsedMinutes } from './service/service-status';
import type { ServiceServerVM, ServiceTableStatus, ZoneWithTables } from './service/service.types';
import type { AdminUser, Order } from '@/types/admin.types';

interface Props {
  tenantId: string;
}

export default function ServiceManager({ tenantId }: Props) {
  const t = useTranslations('service');
  const tc = useTranslations('common');

  const [zones, setZones] = useState<ZoneWithTables[]>([]);
  const [servers, setServers] = useState<AdminUser[]>([]);
  const [readyOrders, setReadyOrders] = useState<Order[]>([]);
  const [openSessions, setOpenSessions] = useState<OpenTableSession[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [statusFilters, setStatusFilters] = useState<Set<ServiceTableStatus>>(new Set());
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'plan'>('grid');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [highlightServerId, setHighlightServerId] = useState<string | null>(null);
  const [planEditMode, setPlanEditMode] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const {
    positions: planPositions,
    setPosition: setPlanPosition,
    reset: resetPlanPositions,
  } = usePlanPositions(tenantId, activeZoneId);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { toast } = useToast();
  const { data: assignments = [] } = useAssignments(tenantId);
  const assignServer = useAssignServer(tenantId);
  const releaseAssignment = useReleaseAssignment(tenantId);

  const loadReadyOrders = useCallback(async () => {
    try {
      const orderService = createOrderService(createClient());
      const data = await orderService.listReadyOrdersToday(tenantId);
      setReadyOrders(data as Order[]);
    } catch (error) {
      logger.error('Failed to load ready orders', error);
    }
  }, [tenantId]);

  const loadOpenSessions = useCallback(async () => {
    try {
      const svc = createServiceManagerService(createClient());
      setOpenSessions(await svc.listOpenSessions(tenantId));
    } catch (error) {
      logger.error('Failed to load open table sessions', error);
    }
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const svc = createServiceManagerService(createClient());
        const { zones, servers, readyOrders, openSessions } = await svc.loadDashboard(tenantId);
        if (cancelled) return;
        setZones(zones as ZoneWithTables[]);
        setServers(servers as AdminUser[]);
        setReadyOrders(readyOrders as Order[]);
        setOpenSessions(openSessions);
      } catch (error) {
        if (!cancelled) logger.error('Failed to load service dashboard', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useRealtimeSubscription<Record<string, unknown>>({
    channelName: `service_orders_${tenantId}`,
    table: 'orders',
    filter: `tenant_id=eq.${tenantId}`,
    // An order change moves both the ready-to-serve list AND table occupancy:
    // a new dine-in order opens a table session, settling it closes the session.
    onInsert: () => {
      void loadReadyOrders();
      void loadOpenSessions();
    },
    onUpdate: () => {
      void loadReadyOrders();
      void loadOpenSessions();
    },
    onDelete: () => {
      void loadReadyOrders();
      void loadOpenSessions();
    },
  });

  const tableVMs = useMemo(
    () => buildTableVMs(zones, assignments, openSessions),
    [zones, assignments, openSessions],
  );

  const allTables = useMemo(
    () => zones.flatMap((z) => z.tables.filter((t) => t.is_active)),
    [zones],
  );

  // Free tables (no open session) are the valid destinations for a reassign.
  const freeTables = useMemo(
    () =>
      tableVMs
        .filter((vm) => vm.status === 'free')
        .map((vm) => ({
          tableNumber: vm.table.table_number,
          label: vm.table.display_name || vm.table.table_number,
        })),
    [tableVMs],
  );

  const serverVMs = useMemo(
    () => buildServerVMs(servers, assignments, allTables),
    [servers, assignments, allTables],
  );

  const serverById = useMemo(() => {
    const m = new Map<string, ServiceServerVM>();
    for (const vm of serverVMs) m.set(vm.server.id, vm);
    return m;
  }, [serverVMs]);

  const avgDurationMin = useMemo(() => {
    if (assignments.length === 0) return 0;
    return Math.round(
      assignments.reduce((s, a) => s + getElapsedMinutes(a.started_at, now), 0) /
        assignments.length,
    );
  }, [assignments, now]);

  const selectedVM = useMemo(
    () => tableVMs.find((vm) => vm.table.id === selectedId) ?? null,
    [tableVMs, selectedId],
  );

  // Load current open order for the selected table.
  // The "set to null when selectedId becomes null" branch intentionally uses
  // setState in an effect (ESLint's `react-hooks/set-state-in-effect` is
  // overly strict for this reset-on-key pattern; deriving the order purely
  // via useMemo would require a non-blocking fetch primitive not available).
  useEffect(() => {
    let cancelled = false;
    if (!selectedId) {
      setCurrentOrder(null);
      return;
    }
    void (async () => {
      try {
        const orderService = createOrderService(createClient());
        const data = await orderService.getCurrentOrderForTable(tenantId, selectedId);
        if (cancelled) return;
        if (!data) {
          setCurrentOrder(null);
          return;
        }
        const raw = data as Record<string, unknown>;
        const orderItems = (raw.order_items ?? []) as Array<Record<string, unknown>>;
        const transformed: Order = {
          ...(raw as unknown as Order),
          items: orderItems.map((oi) => ({
            id: (oi.id as string) ?? '',
            name: (oi.item_name as string) || 'Item',
            quantity: (oi.quantity as number) || 0,
            price: (oi.price_at_order as number) || 0,
          })),
        };
        setCurrentOrder(transformed);
      } catch (error) {
        if (cancelled) return;
        logger.error('Failed to load current order for table', error);
        setCurrentOrder(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, tenantId]);

  const handleToggleStatusFilter = useCallback((s: ServiceTableStatus) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }, []);

  const handleMarkDelivered = useCallback(
    async (orderId: string) => {
      setReadyOrders((prev) => prev.filter((o) => o.id !== orderId));
      try {
        const result = await actionUpdateOrderStatus(tenantId, orderId, 'delivered');
        if (result.error) throw new Error(result.error);
        toast({ title: t('markDelivered') });
      } catch (error) {
        logger.error('Failed to mark order as delivered', error);
        toast({ title: tc('error'), variant: 'destructive' });
        void loadReadyOrders();
      }
    },
    [tenantId, loadReadyOrders, toast, tc, t],
  );

  const handleDrop = useCallback(
    (tableId: string, serverId: string) => {
      assignServer.mutate({ tableId, serverId });
    },
    [assignServer],
  );

  const handleAssignFromDetail = useCallback(
    (tableId: string, serverId: string) => {
      assignServer.mutate({ tableId, serverId });
    },
    [assignServer],
  );

  const handleRelease = useCallback(
    (assignmentId: string) => {
      releaseAssignment.mutate(assignmentId);
    },
    [releaseAssignment],
  );

  // -- Keyboard shortcuts ------------------------------------
  const ts = useTranslations('shortcuts');
  const shortcuts = useMemo<ShortcutDefinition[]>(
    () => [
      {
        id: 'service-focus-search',
        label: ts('toggleFilters'),
        section: 'contextual',
        keys: ['f'],
        action: () => {
          const input = document.querySelector<HTMLInputElement>('[data-service-search-input]');
          input?.focus();
        },
      },
      {
        id: 'service-view-grid',
        label: t('gridMode'),
        section: 'contextual',
        keys: ['g'],
        action: () => setViewMode('grid'),
      },
      {
        id: 'service-clear-highlight',
        label: t('clearFilter'),
        section: 'contextual',
        keys: ['c'],
        action: () => setHighlightServerId(null),
      },
      {
        id: 'service-close-detail',
        label: tc('close'),
        section: 'contextual',
        keys: ['Escape'],
        action: () => {
          setSelectedId(null);
          setHighlightServerId(null);
        },
      },
    ],
    [ts, t, tc],
  );
  useContextualShortcuts(shortcuts);

  const { floorLabels, metricsLabels, panelLabels, detailLabels } = useServiceLabels();

  if (loading) {
    return <ServiceManagerSkeleton />;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ServiceMetricsBar tables={tableVMs} avgDurationMin={avgDurationMin} labels={metricsLabels} />

      <div className="flex flex-1 min-h-0">
        <ServiceFloorPlan
          zones={zones}
          tables={tableVMs}
          serverById={serverById}
          activeZoneId={activeZoneId}
          statusFilters={statusFilters}
          search={search}
          viewMode={viewMode}
          selectedId={selectedId}
          dragOverId={dragOverId}
          labels={floorLabels}
          onZoneChange={setActiveZoneId}
          onToggleStatusFilter={handleToggleStatusFilter}
          onSearch={setSearch}
          onViewMode={setViewMode}
          onSelect={setSelectedId}
          onRelease={handleRelease}
          onDragOver={setDragOverId}
          onDragLeave={(id) => setDragOverId((cur) => (cur === id ? null : cur))}
          onDrop={handleDrop}
          highlightServerId={highlightServerId}
          onClearHighlight={() => setHighlightServerId(null)}
          planEditMode={planEditMode}
          planPositions={planPositions}
          onTogglePlanEdit={() => setPlanEditMode((v) => !v)}
          onPlanPositionChange={setPlanPosition}
          onPlanResetPositions={resetPlanPositions}
        />

        <div className="hidden lg:flex">
          <ServiceRightPanel
            servers={serverVMs}
            readyOrders={readyOrders}
            now={now}
            highlightServerId={highlightServerId}
            labels={panelLabels}
            onDragStartServer={() => {}}
            onDragEndServer={() => {}}
            onHighlightServer={setHighlightServerId}
            onMarkDelivered={handleMarkDelivered}
          />
        </div>
      </div>

      <ServiceMobileOrders
        readyOrders={readyOrders}
        now={now}
        labels={{
          title: t('ordersActiveTitle'),
          empty: t('ordersEmpty'),
          markDelivered: t('markDelivered'),
          tableShort: t('tableShort'),
          minutesAgoShort: (min: number) => t('minutesAgoShort', { min }),
          itemsCount: (n: number) => t('itemsCount', { count: n }),
        }}
        onMarkDelivered={handleMarkDelivered}
      />

      <ServiceTableDetail
        vm={selectedVM}
        servers={serverVMs}
        currentOrder={currentOrder}
        currencySymbol={'XAF'}
        freeTables={freeTables}
        onClose={() => setSelectedId(null)}
        onAssignServer={handleAssignFromDetail}
        onRelease={handleRelease}
        onReassigned={() => {
          loadOpenSessions();
          loadReadyOrders();
          setSelectedId(null);
        }}
        labels={detailLabels}
      />
    </div>
  );
}
