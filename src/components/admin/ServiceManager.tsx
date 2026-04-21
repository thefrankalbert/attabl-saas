'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { createOrderService } from '@/services/order.service';
import { createServiceManagerService } from '@/services/service-manager.service';
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

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const svc = createServiceManagerService(createClient());
        const { zones, servers, readyOrders } = await svc.loadDashboard(tenantId);
        if (cancelled) return;
        setZones(zones as ZoneWithTables[]);
        setServers(servers as AdminUser[]);
        setReadyOrders(readyOrders as Order[]);
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
    onInsert: () => loadReadyOrders(),
    onUpdate: () => loadReadyOrders(),
    onDelete: () => loadReadyOrders(),
  });

  const tableVMs = useMemo(
    () => buildTableVMs(zones, assignments, readyOrders),
    [zones, assignments, readyOrders],
  );

  const allTables = useMemo(
    () => zones.flatMap((z) => z.tables.filter((t) => t.is_active)),
    [zones],
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
        const orderService = createOrderService(createClient());
        await orderService.updateStatus(orderId, tenantId, 'delivered');
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

  // ── Keyboard shortcuts ────────────────────────────────────
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

  const floorLabels = useMemo(
    () => ({
      allTab: tc('all'),
      gridMode: t('gridMode'),
      planMode: t('planMode'),
      searchPlaceholder: t('searchPlaceholder'),
      free: t('statusFree'),
      occupied: t('statusOccupied'),
      reserved: t('statusOccupied'),
      cleaning: t('statusOccupied'),
      noTablesMatch: t('noTablesMatch'),
      seatsShort: t('seatsShort'),
      emptyServerDropHint: t('dropServerHint'),
      emptyServerCleaningHint: t('dropServerHint'),
      emptyServerReserved: t('dropServerHint'),
      sinceSince: t('sinceSince'),
      occupiedSummary: t('occupiedSummary'),
      freeSummary: t('freeSummary'),
      reservedSummary: t('reservedSummary'),
      releaseAria: t('releaseAssignment'),
      filteredByServerLabel: (name: string) => t('filteredByServer', { name }),
      clearFilterAria: t('clearFilter'),
      planSelectZone: t('planSelectZone'),
      roomPlanLabel: t('roomPlanLabel'),
      editLayout: t('editLayout'),
      exitEditLayout: t('exitEditLayout'),
      resetLayout: t('resetLayout'),
      editModeHint: t('editModeHint'),
    }),
    [t, tc],
  );

  const metricsLabels = useMemo(
    () => ({
      occupationRate: t('occupationRate'),
      waitTime: t('avgWaitTime'),
      minShort: t('minShort'),
      occupiedSummary: t('occupiedSummary'),
      freeSummary: t('freeSummary'),
      reservedSummary: t('reservedSummary'),
      cleaningSummary: t('cleaningSummary'),
      activeAssignments: t('activeAssignmentsShort'),
      tablesTotal: t('tablesTotal'),
      coversLabel: t('coversLabel'),
      coversSub: t('coversSub'),
    }),
    [t],
  );

  const panelLabels = useMemo(
    () => ({
      tabServers: t('tabServers'),
      tabOrders: t('tabOrders'),
      inService: t('inService'),
      available: t('available'),
      onBreak: t('onBreak'),
      availableStateEmpty: t('availableEmpty'),
      inServiceEmpty: t('inServiceEmpty'),
      ordersTitle: t('ordersActiveTitle'),
      ordersEmpty: t('ordersEmpty'),
      dragHint: t('dragHint'),
      markDelivered: t('markDelivered'),
      tableShort: t('tableShort'),
      itemsCount: (count: number) => t('itemsCount', { count }),
      minutesAgoShort: (min: number) => t('minutesAgoShort', { min }),
      roleLabel: t('roleLabel'),
      availableStatus: t('availableStatus'),
      tablesPlural: (n: number) => t('tablesPlural', { count: n }),
    }),
    [t],
  );

  const detailLabels = useMemo(
    () => ({
      closeAria: tc('close'),
      tableLabel: t('tableLabel'),
      seatsLabel: t('seatsLabel'),
      statusFree: t('statusFree'),
      statusOccupied: t('statusOccupied'),
      infoSection: t('infoSection'),
      roomLabel: t('roomLabel'),
      seatsRow: t('seatsRow'),
      arrivalRow: t('arrivalRow'),
      assignedServerSection: t('assignedServerSection'),
      noServerAssigned: t('noServerAssigned'),
      selectServer: t('selectServer'),
      releaseBtn: t('release'),
      currentOrderSection: t('currentOrderSection'),
      orderEmpty: t('orderEmpty'),
      orderOpened: t('orderOpened'),
      orderTotal: tc('total'),
    }),
    [t, tc],
  );

  if (loading) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex items-stretch border-b border-app-border/50 bg-app-bg">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex-1 border-r border-app-border/50 px-5 py-3.5 last:border-r-0"
            >
              <div className="mb-2 h-3 w-24 animate-pulse rounded bg-app-elevated" />
              <div className="h-6 w-16 animate-pulse rounded bg-app-elevated" />
            </div>
          ))}
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 p-4">
            <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(168px,1fr))]">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-[88px] animate-pulse rounded bg-app-elevated" />
              ))}
            </div>
          </div>
          <div className="hidden w-[280px] shrink-0 border-l border-app-border/50 bg-app-card lg:block xl:w-[320px]" />
        </div>
      </div>
    );
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
        onClose={() => setSelectedId(null)}
        onAssignServer={handleAssignFromDetail}
        onRelease={handleRelease}
        labels={detailLabels}
      />
    </div>
  );
}
