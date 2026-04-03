'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useAssignments } from '@/hooks/queries/useAssignments';
import { useAssignServer, useReleaseAssignment } from '@/hooks/mutations/useAssignment';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useToast } from '@/components/ui/use-toast';
import {
  UserCheck,
  X,
  LayoutGrid,
  Activity,
  Clock,
  Search,
  User,
  CheckCircle2,
  Utensils,
  Users,
} from 'lucide-react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import type { Table, Zone, AdminUser, TableAssignment, Order } from '@/types/admin.types';

// ─── Types ──────────────────────────────────────────────────

interface Props {
  tenantId: string;
}

type ZoneWithTables = Zone & { tables: Table[] };

// ─── Helpers ────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function getElapsedMinutes(startedAt: string): number {
  return Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
}

function getChairLayout(capacity: number): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  const c = Math.min(capacity, 12);
  if (c <= 1) return { top: 1, right: 0, bottom: 0, left: 0 };
  if (c === 2) return { top: 1, right: 0, bottom: 1, left: 0 };
  if (c === 3) return { top: 1, right: 1, bottom: 1, left: 0 };
  if (c === 4) return { top: 1, right: 1, bottom: 1, left: 1 };
  if (c === 5) return { top: 2, right: 1, bottom: 1, left: 1 };
  if (c === 6) return { top: 2, right: 1, bottom: 2, left: 1 };
  if (c === 7) return { top: 2, right: 2, bottom: 2, left: 1 };
  if (c === 8) return { top: 2, right: 2, bottom: 2, left: 2 };
  if (c === 9) return { top: 3, right: 2, bottom: 2, left: 2 };
  if (c === 10) return { top: 3, right: 2, bottom: 3, left: 2 };
  if (c === 11) return { top: 3, right: 3, bottom: 3, left: 2 };
  return { top: 3, right: 3, bottom: 3, left: 3 };
}

// Status color for table assignment
function getStatusColor(isAssigned: boolean): {
  chair: string;
  border: string;
  badge: string;
  badgeText: string;
  label: string;
  labelColor: string;
} {
  if (isAssigned) {
    return {
      chair: 'bg-status-success',
      border: 'border-l-status-success',
      badge: 'bg-status-success/15',
      badgeText: 'text-status-success',
      label: 'occupied',
      labelColor: 'text-status-success',
    };
  }
  return {
    chair: 'bg-app-text-muted/40',
    border: 'border-l-app-border',
    badge: 'bg-app-bg',
    badgeText: 'text-app-text-muted',
    label: 'vacant',
    labelColor: 'text-app-text-muted',
  };
}

// ─── Chair Shape (rounded rectangle, like the reference) ────

function ChairShape({ direction, color }: { direction: 'horizontal' | 'vertical'; color: string }) {
  const isH = direction === 'horizontal';
  return (
    <div
      className={cn(
        'rounded-sm transition-colors duration-300',
        isH ? 'w-6 h-[6px] sm:w-7 sm:h-[7px]' : 'w-[6px] h-6 sm:w-[7px] sm:h-7',
        color,
      )}
    />
  );
}

// ─── Chair Row (renders N chair shapes around the table) ────

function ChairRow({
  count,
  direction,
  color,
}: {
  count: number;
  direction: 'horizontal' | 'vertical';
  color: string;
}) {
  if (count === 0) return null;
  const isH = direction === 'horizontal';
  return (
    <div
      className={cn('flex items-center justify-center', isH ? 'flex-row gap-2' : 'flex-col gap-2')}
    >
      {Array.from({ length: count }).map((_, i) => (
        <ChairShape key={i} direction={direction} color={color} />
      ))}
    </div>
  );
}

// ─── Visual Table Card (redesigned to match reference) ──────

interface VisualTableProps {
  table: Table;
  assignment: TableAssignment | undefined;
  servers: AdminUser[];
  onAssign: (tableId: string, serverId: string) => void;
  onRelease: (assignmentId: string) => void;
  assignLabel: string;
  releaseLabel: string;
  occupiedLabel: string;
  vacantLabel: string;
  releaseAriaLabel: string;
  assignAriaLabel: string;
}

function VisualTable({
  table,
  assignment,
  servers,
  onAssign,
  onRelease,
  assignLabel,
  releaseLabel,
  occupiedLabel,
  vacantLabel,
  releaseAriaLabel,
  assignAriaLabel,
}: VisualTableProps) {
  const chairs = getChairLayout(table.capacity);
  const isAssigned = !!assignment;
  const status = getStatusColor(isAssigned);

  return (
    <div className="group relative py-3 px-2.5">
      {/* Chairs: top */}
      <div className="flex justify-center mb-1.5">
        <ChairRow count={chairs.top} direction="horizontal" color={status.chair} />
      </div>

      <div className="flex items-stretch gap-1.5">
        {/* Chairs: left */}
        <div className="flex items-center shrink-0">
          <ChairRow count={chairs.left} direction="vertical" color={status.chair} />
        </div>

        {/* Table surface */}
        <div
          className={cn(
            'relative flex-1 rounded-xl border-l-[3px] transition-all duration-200',
            'bg-app-card/80 backdrop-blur-sm',
            'border border-app-border/60 hover:border-app-border-hover',
            'shadow-sm hover:shadow-md',
            status.border,
            'min-h-[110px] sm:min-h-[120px] flex flex-col',
          )}
        >
          {/* Header row: table number + release button */}
          <div className="flex items-start justify-between px-3 pt-3">
            <span className="text-sm font-bold text-app-text tracking-wide">
              {table.display_name || table.table_number}
            </span>
            {isAssigned && (
              <button
                onClick={() => onRelease(assignment.id)}
                className={cn(
                  'p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg',
                  'opacity-0 group-hover:opacity-100 transition-all duration-200',
                  'hover:bg-status-error/10 text-app-text-muted hover:text-status-error',
                  'focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none focus-visible:opacity-100',
                )}
                title={releaseLabel}
                aria-label={releaseAriaLabel}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Content: server name + status */}
          <div className="mt-auto px-3 pb-3">
            {isAssigned ? (
              <>
                <p className="text-xs font-semibold text-app-text break-words leading-tight">
                  {assignment.server?.full_name}
                </p>
                <p className={cn('text-[11px] font-bold mt-1', status.labelColor)}>
                  {occupiedLabel}
                </p>
              </>
            ) : (
              <>
                <p className={cn('text-[11px] font-medium mb-1.5', status.labelColor)}>
                  {vacantLabel}
                </p>
                <Select onValueChange={(val) => onAssign(table.id, val)}>
                  <SelectTrigger
                    className="min-h-[40px] text-xs bg-app-bg/60 border-app-border/50 rounded-lg"
                    aria-label={assignAriaLabel}
                  >
                    <SelectValue placeholder={assignLabel} />
                  </SelectTrigger>
                  <SelectContent>
                    {servers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        </div>

        {/* Chairs: right */}
        <div className="flex items-center shrink-0">
          <ChairRow count={chairs.right} direction="vertical" color={status.chair} />
        </div>
      </div>

      {/* Chairs: bottom */}
      <div className="flex justify-center mt-1.5">
        <ChairRow count={chairs.bottom} direction="horizontal" color={status.chair} />
      </div>
    </div>
  );
}

// ─── Sidebar Assignment Entry ───────────────────────────────

function SidebarEntry({ assignment, zoneName }: { assignment: TableAssignment; zoneName: string }) {
  const elapsed = getElapsedMinutes(assignment.started_at);

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-app-bg/40 hover:bg-app-bg/70 transition-colors border border-transparent hover:border-app-border/30">
      {/* Time column */}
      <div className="shrink-0 text-center min-w-[44px]">
        <p className="text-xs font-bold text-app-text tabular-nums">
          {formatTime(assignment.started_at)}
        </p>
        <p className="text-[10px] text-app-text-muted tabular-nums">{elapsed} min</p>
      </div>

      {/* Separator */}
      <div className="w-px h-8 bg-app-border/50 shrink-0" />

      {/* Server info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-app-text break-words leading-tight">
          {assignment.server?.full_name ?? ' - '}
        </p>
        <p className="text-[10px] text-app-text-muted mt-0.5">
          {assignment.server?.role ?? ''} {zoneName ? ` · ${zoneName}` : ''}
        </p>
      </div>

      {/* Table badge */}
      <div className="shrink-0">
        <span className="inline-flex items-center justify-center min-w-[32px] h-8 rounded-lg bg-status-success/15 text-status-success text-[11px] font-bold px-2 border border-status-success/20">
          {assignment.table?.display_name || assignment.table?.table_number || ' - '}
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

export default function ServiceManager({ tenantId }: Props) {
  const t = useTranslations('service');
  const tc = useTranslations('common');
  const [zones, setZones] = useState<ZoneWithTables[]>([]);
  const [servers, setServers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');

  const [readyOrders, setReadyOrders] = useState<Order[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const { toast } = useToast();

  // Refresh "now" every 60s for elapsed-time display
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const { data: assignments = [] } = useAssignments(tenantId);
  const assignServer = useAssignServer(tenantId);
  const releaseAssignment = useReleaseAssignment(tenantId);

  // ── Data fetching (preserved) ─────────────────────────────

  const loadReadyOrders = useCallback(async () => {
    const supabase = createClient();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('tenant_id', tenantId)
      .eq('status', 'ready')
      .gte('created_at', todayStart.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Failed to load ready orders', error);
    } else {
      setReadyOrders(data as Order[]);
    }
  }, [tenantId]);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      const [zonesResult, serversResult, ordersResult] = await Promise.all([
        supabase
          .from('zones')
          .select('*, tables(*), venues!inner(tenant_id)')
          .eq('venues.tenant_id', tenantId)
          .order('display_order'),
        supabase
          .from('admin_users')
          .select('id, full_name, role, is_active')
          .eq('tenant_id', tenantId)
          .in('role', ['waiter', 'manager', 'admin', 'owner'])
          .eq('is_active', true)
          .order('full_name'),
        (() => {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          return supabase
            .from('orders')
            .select('*, order_items(*)')
            .eq('tenant_id', tenantId)
            .eq('status', 'ready')
            .gte('created_at', todayStart.toISOString())
            .order('created_at', { ascending: true });
        })(),
      ]);

      if (zonesResult.data) setZones(zonesResult.data as ZoneWithTables[]);
      if (serversResult.data) setServers(serversResult.data as AdminUser[]);
      if (ordersResult.data) setReadyOrders(ordersResult.data as Order[]);
      if (ordersResult.error) logger.error('Failed to load ready orders', ordersResult.error);
      setLoading(false);
    }
    fetchData();
  }, [tenantId]);

  // ── Realtime subscription for assignments ──────────────────

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`assignments-realtime-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'table_assignments',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {},
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  // ── Realtime subscription for orders (ready status) ────────

  useRealtimeSubscription<Record<string, unknown>>({
    channelName: `service_orders_${tenantId}`,
    table: 'orders',
    filter: `tenant_id=eq.${tenantId}`,
    onInsert: () => {
      loadReadyOrders();
    },
    onUpdate: () => {
      loadReadyOrders();
    },
    onDelete: () => {
      loadReadyOrders();
    },
  });

  // ── Mark order as delivered ─────────────────────────────────

  const handleMarkDelivered = useCallback(
    async (orderId: string) => {
      // Optimistic update
      setReadyOrders((prev) => prev.filter((o) => o.id !== orderId));

      const supabase = createClient();
      const { error } = await supabase
        .from('orders')
        .update({ status: 'delivered' })
        .eq('id', orderId)
        .eq('tenant_id', tenantId);

      if (error) {
        logger.error('Failed to mark order as delivered', error);
        toast({ title: tc('error'), variant: 'destructive' });
        loadReadyOrders(); // Revert on error
      } else {
        toast({ title: t('markDelivered') });
      }
    },
    [tenantId, loadReadyOrders, toast, tc, t],
  );

  // ── Handlers (preserved) ──────────────────────────────────

  const getAssignmentForTable = useCallback(
    (tableId: string) => assignments.find((a) => a.table_id === tableId),
    [assignments],
  );

  const handleAssign = (tableId: string, serverId: string) => {
    assignServer.mutate({ tableId, serverId });
  };

  const handleRelease = (assignmentId: string) => {
    releaseAssignment.mutate(assignmentId);
  };

  // ── Computed data ─────────────────────────────────────────

  const stats = useMemo(() => {
    const all = zones.flatMap((z) => z.tables.filter((tbl) => tbl.is_active));
    const total = all.length;
    const occupied = all.filter((tbl) => getAssignmentForTable(tbl.id)).length;
    const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;
    return { total, occupied, pct };
  }, [zones, getAssignmentForTable]);

  const zoneStats = useMemo(() => {
    const map: Record<string, { occupied: number; total: number }> = {};
    for (const zone of zones) {
      const active = zone.tables.filter((tbl) => tbl.is_active);
      const occupied = active.filter((tbl) => getAssignmentForTable(tbl.id)).length;
      map[zone.id] = { occupied, total: active.length };
    }
    return map;
  }, [zones, getAssignmentForTable]);

  const filteredZones = useMemo(() => {
    if (!activeZoneId) return zones;
    return zones.filter((z) => z.id === activeZoneId);
  }, [zones, activeZoneId]);

  const assignedServerIds = useMemo(
    () => new Set(assignments.map((a) => a.server_id)),
    [assignments],
  );

  const availableServers = useMemo(
    () => servers.filter((s) => !assignedServerIds.has(s.id)),
    [servers, assignedServerIds],
  );

  const avgDuration = useMemo(() => {
    if (assignments.length === 0) return 0;
    return Math.round(
      assignments.reduce((sum, a) => sum + getElapsedMinutes(a.started_at), 0) / assignments.length,
    );
  }, [assignments]);

  // Sidebar search filter
  const filteredAssignments = useMemo(() => {
    if (!sidebarSearch.trim()) return assignments;
    const q = sidebarSearch.toLowerCase();
    return assignments.filter(
      (a) =>
        a.server?.full_name?.toLowerCase().includes(q) ||
        a.table?.display_name?.toLowerCase().includes(q) ||
        a.table?.table_number?.toLowerCase().includes(q),
    );
  }, [assignments, sidebarSearch]);

  const getZoneName = useCallback(
    (zoneId: string | undefined) => {
      if (!zoneId) return '';
      return zones.find((z) => z.id === zoneId)?.name ?? '';
    },
    [zones],
  );

  // ── Loading skeleton ──────────────────────────────────────

  if (loading) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        {/* Header skeleton */}
        <div className="shrink-0 flex items-center gap-3 mb-5">
          <div className="h-8 w-36 bg-app-card rounded-xl animate-pulse" />
          <div className="h-9 w-28 bg-app-card rounded-xl animate-pulse" />
          <div className="h-9 w-28 bg-app-card rounded-xl animate-pulse" />
        </div>
        <div className="flex-1 min-h-0 flex gap-5">
          {/* Sidebar skeleton */}
          <div className="hidden @md:block @md:w-64 @lg:w-80 shrink-0">
            <div className="h-full bg-app-card rounded-2xl border border-app-border animate-pulse" />
          </div>
          {/* Grid skeleton */}
          <div className="flex-1 space-y-4">
            <div className="flex gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 w-32 bg-app-card rounded-xl animate-pulse" />
              ))}
            </div>
            <div className="grid grid-cols-2 @sm:grid-cols-3 @xl:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div
                  key={i}
                  className="h-[160px] bg-app-card rounded-2xl border border-app-border animate-pulse"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ═══ Header: Title + Stats ═══════════════════════════════ */}
      <div className="shrink-0 flex flex-wrap items-center gap-3 mb-4 sm:mb-5">
        <h1 className="text-lg sm:text-xl font-bold text-app-text shrink-0">{t('title')}</h1>

        {/* Stats pills */}
        <div className="flex items-center gap-2 ml-auto">
          <div className="flex items-center gap-2 px-3.5 py-2 bg-app-card rounded-xl border border-app-border text-xs">
            <Clock className="w-3.5 h-3.5 text-app-text-muted" />
            <span className="text-app-text-secondary font-medium tabular-nums">
              {avgDuration} min
            </span>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-2 bg-app-card rounded-xl border border-app-border text-xs">
            <Activity className="w-3.5 h-3.5 text-status-success" />
            <span className="text-app-text-secondary font-medium tabular-nums">
              {stats.pct}% {t('fullCapacity')}
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-3.5 py-2 bg-app-card rounded-xl border border-app-border text-xs">
            <Users className="w-3.5 h-3.5 text-status-info" />
            <span className="text-app-text-secondary font-medium tabular-nums">
              {stats.occupied}/{stats.total}
            </span>
          </div>
        </div>
      </div>

      {/* ═══ Content: Sidebar + Grid ═════════════════════════════ */}
      <div className="flex-1 min-h-0 flex gap-5 mt-1">
        {/* ─── Left sidebar (desktop/tablet) ─────────────────── */}
        <aside className="hidden @md:flex @md:w-64 @lg:w-80 shrink-0 flex-col bg-app-card rounded-2xl border border-app-border overflow-hidden">
          {/* Search */}
          <div className="p-4 border-b border-app-border/60">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-text-muted" />
              <Input
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchAssignments')}
                className="pl-9 h-10 text-sm bg-app-bg/60 border-app-border/40 rounded-xl"
              />
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-6">
            {/* ── EN SERVICE (active assignments) ── */}
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-status-success">
                  {t('onDuty')}
                </span>
                <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full bg-status-success/15 text-status-success text-[10px] font-bold px-1.5 border border-status-success/20">
                  {filteredAssignments.length}
                </span>
              </div>
              <div className="space-y-2">
                {filteredAssignments.length === 0 ? (
                  <p className="text-xs text-app-text-muted py-3 text-center">
                    {t('noTablesAssigned')}
                  </p>
                ) : (
                  filteredAssignments.map((a) => (
                    <SidebarEntry
                      key={a.id}
                      assignment={a}
                      zoneName={getZoneName(a.table?.zone_id)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* ── COMMANDES PRETES (ready orders) ── */}
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-status-warning">
                  {t('readyOrders')}
                </span>
                <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full bg-status-warning/15 text-status-warning text-[10px] font-bold px-1.5 border border-status-warning/20">
                  {readyOrders.length}
                </span>
              </div>
              <div className="space-y-2">
                {readyOrders.length === 0 ? (
                  <p className="text-xs text-app-text-muted py-3 text-center">
                    {t('noReadyOrdersDesc')}
                  </p>
                ) : (
                  readyOrders.map((order) => {
                    const items =
                      order.items ||
                      (order as { order_items?: { id: string }[] }).order_items ||
                      [];
                    const minutesAgo = Math.floor(
                      (now - new Date(order.created_at).getTime()) / 60000,
                    );
                    return (
                      <div
                        key={order.id}
                        className="p-3 rounded-xl bg-status-warning/5 border border-status-warning/15 hover:bg-status-warning/10 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <Utensils className="w-3.5 h-3.5 text-status-warning" />
                            <span className="text-xs font-bold text-app-text">
                              {t('tableLabel')} {order.table_number}
                            </span>
                          </div>
                          <span className="text-[10px] text-app-text-muted tabular-nums">
                            {t('orderAge', { minutes: minutesAgo })}
                          </span>
                        </div>
                        <p className="text-[10px] text-app-text-muted mb-2.5">
                          {t('itemsCount', { count: items.length })}
                        </p>
                        <button
                          onClick={() => handleMarkDelivered(order.id)}
                          aria-label={t('markDelivered')}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-xl bg-status-success text-white text-xs font-bold hover:bg-status-success/90 active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {t('markDelivered')}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* ── DISPONIBLES (available servers) ── */}
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-status-info">
                  {t('availableServers')}
                </span>
                <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full bg-status-info/15 text-status-info text-[10px] font-bold px-1.5 border border-status-info/20">
                  {availableServers.length}
                </span>
              </div>
              <div className="space-y-2">
                {availableServers.length === 0 ? (
                  <p className="text-xs text-app-text-muted py-3 text-center"> - </p>
                ) : (
                  availableServers.map((server) => (
                    <div
                      key={server.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-app-bg/40 hover:bg-app-bg/70 transition-colors border border-transparent hover:border-app-border/30"
                    >
                      <div className="w-8 h-8 rounded-full bg-status-info/10 flex items-center justify-center shrink-0 border border-status-info/20">
                        <User className="w-4 h-4 text-status-info" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-app-text break-words">
                          {server.full_name ?? ' - '}
                        </p>
                        <p className="text-[10px] text-app-text-muted">{server.role}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* ─── Main content (zone tabs + table grid) ─────────── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Zone tabs row */}
          <div className="shrink-0 flex flex-col @sm:flex-row @sm:items-center gap-3 mb-4">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
              <button
                onClick={() => setActiveZoneId(null)}
                aria-label={tc('all')}
                className={cn(
                  'shrink-0 px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold transition-all border',
                  'focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
                  !activeZoneId
                    ? 'bg-accent text-accent-text border-accent shadow-sm'
                    : 'bg-app-card text-app-text-secondary border-app-border hover:text-app-text hover:border-app-border-hover',
                )}
              >
                {tc('all')}
                <span
                  className={cn(
                    'ml-2 text-[10px] px-2 py-0.5 rounded-md font-bold',
                    !activeZoneId ? 'bg-accent-text/20' : 'bg-app-bg',
                  )}
                >
                  {stats.occupied}/{stats.total}
                </span>
              </button>
              {zones.map((zone) => {
                const zs = zoneStats[zone.id];
                const isActive = activeZoneId === zone.id;
                return (
                  <button
                    key={zone.id}
                    onClick={() => setActiveZoneId(zone.id)}
                    aria-label={zone.name}
                    className={cn(
                      'shrink-0 px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold transition-all border',
                      'focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
                      isActive
                        ? 'bg-accent text-accent-text border-accent shadow-sm'
                        : 'bg-app-card text-app-text-secondary border-app-border hover:text-app-text hover:border-app-border-hover',
                    )}
                  >
                    {zone.name}
                    {zs && (
                      <span
                        className={cn(
                          'ml-2 text-[10px] px-2 py-0.5 rounded-md font-bold',
                          isActive ? 'bg-accent-text/20' : 'bg-app-bg',
                        )}
                      >
                        {zs.occupied}/{zs.total}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollable table grid */}
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-6">
            {zones.length === 0 ? (
              <div className="bg-app-card rounded-2xl border border-app-border p-16 text-center">
                <div className="w-16 h-16 bg-app-bg rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <LayoutGrid className="w-8 h-8 text-app-text-muted" />
                </div>
                <h3 className="text-lg font-bold text-app-text">{t('noZones')}</h3>
              </div>
            ) : (
              filteredZones.map((zone) => {
                const activeTables = zone.tables.filter((tbl) => tbl.is_active);
                if (activeTables.length === 0) return null;

                return (
                  <div key={zone.id}>
                    {/* Zone divider (only when All is selected) */}
                    {!activeZoneId && (
                      <div className="flex items-center gap-3 mb-4">
                        <h2 className="text-sm font-bold text-app-text whitespace-nowrap">
                          {zone.name}
                        </h2>
                        <div className="h-px flex-1 bg-app-border/50" />
                        <span className="text-[10px] text-app-text-muted font-semibold whitespace-nowrap bg-app-card px-2.5 py-1 rounded-lg border border-app-border">
                          {activeTables.length} tables
                        </span>
                      </div>
                    )}

                    {/* Visual table grid with chairs */}
                    <div className="grid grid-cols-2 @sm:grid-cols-3 @lg:grid-cols-3 @xl:grid-cols-4 @2xl:grid-cols-5 gap-2 sm:gap-3">
                      {activeTables.map((table) => (
                        <VisualTable
                          key={table.id}
                          table={table}
                          assignment={getAssignmentForTable(table.id)}
                          servers={servers}
                          onAssign={handleAssign}
                          onRelease={handleRelease}
                          assignLabel={t('assignServer')}
                          releaseLabel={t('release')}
                          occupiedLabel={t('occupied')}
                          vacantLabel={t('vacant')}
                          releaseAriaLabel={t('releaseAssignment')}
                          assignAriaLabel={t('assignServer')}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            )}

            {/* Mobile-only: ready orders + assignment summary */}
            <div className="@md:hidden space-y-4 pb-4">
              {/* Ready orders - mobile */}
              {readyOrders.length > 0 && (
                <div className="bg-app-card rounded-2xl border border-status-warning/20 p-4">
                  <div className="flex items-center gap-2.5 mb-3">
                    <CheckCircle2 className="w-4 h-4 text-status-warning" />
                    <span className="text-sm font-bold text-app-text">{t('readyOrders')}</span>
                    <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full bg-status-warning/15 text-status-warning text-[10px] font-bold px-1.5">
                      {readyOrders.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {readyOrders.map((order) => {
                      const items =
                        order.items ||
                        (order as { order_items?: { id: string }[] }).order_items ||
                        [];
                      const minutesAgo = Math.floor(
                        (now - new Date(order.created_at).getTime()) / 60000,
                      );
                      return (
                        <div
                          key={order.id}
                          className="flex items-center justify-between py-2.5 border-b border-app-border/40 last:border-0"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <Utensils className="w-3.5 h-3.5 text-status-warning shrink-0" />
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-app-text">
                                {t('tableLabel')} {order.table_number}
                              </span>
                              <span className="text-[10px] text-app-text-muted ml-2">
                                {t('itemsCount', { count: items.length })} ·{' '}
                                {t('orderAge', { minutes: minutesAgo })}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleMarkDelivered(order.id)}
                            aria-label={t('markDelivered')}
                            className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-xl bg-status-success text-white text-xs font-bold hover:bg-status-success/90 active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            {t('markDelivered')}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Assignment summary */}
              {assignments.length > 0 && (
                <div className="bg-app-card rounded-2xl border border-app-border p-4">
                  <div className="flex items-center gap-2.5 mb-3">
                    <UserCheck className="w-4 h-4 text-status-success" />
                    <span className="text-sm font-bold text-app-text">
                      {t('activeAssignments', { count: assignments.length })}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {assignments.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between py-2 border-b border-app-border/40 last:border-0"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-xs font-semibold text-app-text break-words">
                            {a.server?.full_name ?? ' - '}
                          </span>
                        </div>
                        <span className="inline-flex items-center justify-center min-w-[32px] h-7 rounded-lg bg-status-success/15 text-status-success text-[10px] font-bold px-2 shrink-0 ml-2 border border-status-success/20">
                          {a.table?.display_name || a.table?.table_number || ' - '}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
