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
import { Button } from '@/components/ui/button';
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

// ─── Chair Row (petites barres arrondies vues de dessus) ────
// Dimensions NON NEGOCIABLES: 24x8 horizontal, 8x24 vertical, borderRadius: 4

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
      className={cn('flex items-center justify-center', isH ? 'flex-row' : 'flex-col')}
      style={{ gap: isH ? 5 : 4 }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={color}
          style={
            isH
              ? { width: 24, height: 8, borderRadius: 4 }
              : { width: 8, height: 24, borderRadius: 4 }
          }
        />
      ))}
    </div>
  );
}

// ─── Visual Table Card ─────────────────────────────────────

interface VisualTableProps {
  table: Table;
  assignment: TableAssignment | undefined;
  servers: AdminUser[];
  onAssign: (tableId: string, serverId: string) => void;
  onRelease: (assignmentId: string) => void;
  occupiedLabel: string;
  vacantLabel: string;
  assignLabel: string;
  releaseLabel: string;
  releaseAriaLabel: string;
  assignAriaLabel: string;
}

function VisualTable({
  table,
  assignment,
  servers,
  onAssign,
  onRelease,
  occupiedLabel,
  vacantLabel,
  assignLabel,
  releaseLabel,
  releaseAriaLabel,
  assignAriaLabel,
}: VisualTableProps) {
  const chairs = getChairLayout(table.capacity);
  const isAssigned = !!assignment;
  const chairColor = isAssigned ? 'bg-emerald-400' : 'bg-gray-500/40';
  const borderColor = isAssigned ? 'border-l-emerald-400' : 'border-l-transparent';
  const statusText = isAssigned ? 'text-emerald-400' : 'text-app-text-muted';

  return (
    <div className="group flex flex-col items-center">
      {/* Chairs top - quasi collees a la carte (2px gap) */}
      <div className="flex items-end justify-center" style={{ marginBottom: 2 }}>
        <ChairRow count={chairs.top} direction="horizontal" color={chairColor} />
      </div>

      {/* Middle row: left chairs + card + right chairs */}
      <div className="flex items-stretch w-full" style={{ gap: 2 }}>
        <div className="flex items-center shrink-0">
          <ChairRow count={chairs.left} direction="vertical" color={chairColor} />
        </div>

        {/* Table surface */}
        <div
          className={cn('relative flex-1 flex flex-col border-l-[3px]', borderColor)}
          style={{ backgroundColor: 'rgba(38, 42, 56, 0.9)', borderRadius: 8, minHeight: 120 }}
        >
          {/* Table number + release */}
          <div className="flex items-start justify-between px-3 pt-3">
            <span className="text-sm font-bold text-app-text">
              {table.display_name || table.table_number}
            </span>
            {isAssigned && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRelease(assignment.id)}
                className={cn(
                  'h-8 w-8 opacity-0 group-hover:opacity-100 transition-all duration-150',
                  'hover:bg-status-error/10 text-app-text-muted hover:text-status-error',
                  'focus-visible:opacity-100',
                )}
                title={releaseLabel}
                aria-label={releaseAriaLabel}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>

          {/* Content - centre-bas */}
          <div className="mt-auto px-3 pb-3">
            {isAssigned ? (
              <>
                <p className="text-xs font-semibold text-app-text leading-tight">
                  {assignment.server?.full_name}
                </p>
                <p className={cn('text-[11px] font-bold mt-0.5', statusText)}>{occupiedLabel}</p>
              </>
            ) : (
              <>
                <p className={cn('text-[11px] font-bold mb-2', statusText)}>{vacantLabel}</p>
                <Select onValueChange={(val) => onAssign(table.id, val)}>
                  <SelectTrigger
                    className="min-h-[36px] text-xs border-0 rounded"
                    style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                    aria-label={assignAriaLabel}
                  >
                    <SelectValue placeholder={assignLabel} />
                  </SelectTrigger>
                  <SelectContent>
                    {servers.map((sv) => (
                      <SelectItem key={sv.id} value={sv.id}>
                        {sv.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center shrink-0">
          <ChairRow count={chairs.right} direction="vertical" color={chairColor} />
        </div>
      </div>

      {/* Chairs bottom - quasi collees a la carte (2px gap) */}
      <div className="flex items-start justify-center" style={{ marginTop: 2 }}>
        <ChairRow count={chairs.bottom} direction="horizontal" color={chairColor} />
      </div>
    </div>
  );
}

// ─── Sidebar Assignment Entry ───────────────────────────────

function SidebarEntry({
  assignment,
  zoneName,
  variant = 'seated',
}: {
  assignment: TableAssignment;
  zoneName: string;
  variant?: 'seated' | 'ready';
}) {
  const isReady = variant === 'ready';
  const barColor = isReady ? 'border-l-amber-400' : 'border-l-emerald-400';
  const badgeClass = isReady
    ? 'bg-amber-400/20 text-amber-400 border-amber-400/30'
    : 'bg-emerald-400/20 text-emerald-400 border-emerald-400/30';

  return (
    <div
      className={cn('flex items-center gap-2.5 py-2.5 px-2 border-l-[3px] rounded-r-md', barColor)}
      style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
    >
      {/* Time */}
      <div className="shrink-0 text-center" style={{ minWidth: 42 }}>
        <p className="text-xs font-bold text-app-text leading-tight tabular-nums">
          {formatTime(assignment.started_at)}
        </p>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-app-text truncate">
          {assignment.server?.full_name ?? ' - '}
        </p>
        <p className="text-[10px] text-app-text-muted truncate leading-tight">
          {assignment.server?.role} · {zoneName}
        </p>
      </div>

      {/* Table badge */}
      <span
        className={cn(
          'shrink-0 inline-flex items-center justify-center min-w-[28px] h-7 rounded-lg text-[10px] font-bold px-1.5 border',
          badgeClass,
        )}
      >
        {assignment.table?.display_name || assignment.table?.table_number}
      </span>
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

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const { data: assignments = [] } = useAssignments(tenantId);
  const assignServer = useAssignServer(tenantId);
  const releaseAssignment = useReleaseAssignment(tenantId);

  // ── Data fetching ─────────────────────────────────────────

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

  // ── Realtime ──────────────────────────────────────────────

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

  useRealtimeSubscription<Record<string, unknown>>({
    channelName: `service_orders_${tenantId}`,
    table: 'orders',
    filter: `tenant_id=eq.${tenantId}`,
    onInsert: () => loadReadyOrders(),
    onUpdate: () => loadReadyOrders(),
    onDelete: () => loadReadyOrders(),
  });

  // ── Handlers ──────────────────────────────────────────────

  const handleMarkDelivered = useCallback(
    async (orderId: string) => {
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
        loadReadyOrders();
      } else {
        toast({ title: t('markDelivered') });
      }
    },
    [tenantId, loadReadyOrders, toast, tc, t],
  );

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

  // ── Loading ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center gap-3 mb-5">
          <div className="h-8 w-36 bg-app-card rounded-lg animate-pulse" />
          <div className="h-9 w-28 bg-app-card rounded-lg animate-pulse" />
          <div className="h-9 w-28 bg-app-card rounded-lg animate-pulse" />
        </div>
        <div className="flex-1 min-h-0 flex">
          <div className="hidden @md:block w-[280px] shrink-0 border-r border-app-border">
            <div className="h-full bg-app-card animate-pulse" />
          </div>
          <div className="flex-1 p-5 space-y-4">
            <div className="flex gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 w-28 bg-app-card rounded-lg animate-pulse" />
              ))}
            </div>
            <div className="grid grid-cols-2 @sm:grid-cols-3 @xl:grid-cols-4 gap-5">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="h-[160px] bg-app-card rounded-lg animate-pulse" />
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
      {/* ═══ CONTENT: Sidebar + Main ════════════════════════════ */}
      <div className="flex-1 flex min-h-0">
        {/* ─── SIDEBAR ──────────────────────────────────────── */}
        <aside
          className="hidden @md:flex w-72 @lg:w-80 shrink-0 flex-col overflow-hidden"
          style={{
            borderRight: '1px solid rgba(255,255,255,0.06)',
            backgroundColor: 'rgba(13, 16, 23, 0.95)',
          }}
        >
          {/* Search */}
          <div className="p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-app-text-muted" />
              <Input
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchAssignments')}
                className="pl-8 h-9 text-xs border-0 rounded-lg text-app-text placeholder:text-app-text-muted"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
              />
            </div>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto px-3 pb-3" style={{ scrollbarWidth: 'none' }}>
            {/* SEATED */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-rose-400">
                  {t('onDuty')}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-rose-400" />
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-rose-400/20 text-rose-400 text-[9px] font-bold px-1.5">
                    {filteredAssignments.length}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
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

            {/* UPCOMING (ready orders) */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-rose-400">
                  {t('readyOrders')}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-rose-400" />
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-rose-400/20 text-rose-400 text-[9px] font-bold px-1.5">
                    {readyOrders.length}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
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
                      <div key={order.id}>
                        <div
                          className="flex items-center gap-2.5 py-2.5 px-2 border-l-[3px] border-l-amber-400 rounded-r-md"
                          style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
                        >
                          <div className="shrink-0 text-center" style={{ minWidth: 42 }}>
                            <p className="text-xs font-bold text-app-text tabular-nums">
                              {minutesAgo}m
                            </p>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-app-text truncate">
                              {t('tableLabel')} {order.table_number}
                            </p>
                            <p className="text-[10px] text-app-text-muted leading-tight">
                              {t('itemsCount', { count: items.length })}
                            </p>
                          </div>
                          <span className="shrink-0 inline-flex items-center justify-center min-w-[28px] h-7 rounded-lg text-[10px] font-bold px-1.5 border bg-amber-400/20 text-amber-400 border-amber-400/30">
                            {order.table_number}
                          </span>
                        </div>
                        <Button
                          onClick={() => handleMarkDelivered(order.id)}
                          aria-label={t('markDelivered')}
                          className="w-full mt-1 gap-1.5 min-h-[44px] bg-status-success text-white text-xs font-bold hover:bg-status-success/90 active:scale-[0.98]"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {t('markDelivered')}
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* DISPONIBLES */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-status-info">
                  {t('availableServers')}
                </span>
                <div className="ml-auto">
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-status-info/20 text-status-info text-[9px] font-bold px-1.5">
                    {availableServers.length}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                {availableServers.length === 0 ? (
                  <p className="text-xs text-app-text-muted py-3 text-center"> - </p>
                ) : (
                  availableServers.map((server) => (
                    <div
                      key={server.id}
                      className="flex items-center gap-3 py-2.5 px-2 rounded-md"
                      style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
                    >
                      <div className="w-7 h-7 rounded-full bg-status-info/10 flex items-center justify-center shrink-0">
                        <User className="w-3.5 h-3.5 text-status-info" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-app-text truncate">
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

        {/* ─── MAIN CONTENT ─────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Zone tabs + Stats */}
          <div
            className="shrink-0 flex items-center gap-4 px-5 py-3"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div
              className="flex items-center gap-1 overflow-x-auto"
              style={{ scrollbarWidth: 'none' }}
            >
              <Button
                variant="ghost"
                onClick={() => setActiveZoneId(null)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 min-h-[44px] rounded-md text-sm font-medium h-auto',
                  !activeZoneId
                    ? 'text-app-text'
                    : 'text-app-text-muted hover:text-app-text-secondary',
                )}
              >
                {tc('all')}
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-app-elevated font-bold tabular-nums">
                  {stats.occupied}/{stats.total}
                </span>
              </Button>
              {zones.map((zone, idx) => {
                const zs = zoneStats[zone.id];
                const isActive = activeZoneId === zone.id;
                const dotColors = [
                  'bg-emerald-400',
                  'bg-blue-400',
                  'bg-rose-400',
                  'bg-purple-400',
                  'bg-orange-400',
                ];
                const dotColor = dotColors[idx % dotColors.length];
                return (
                  <Button
                    key={zone.id}
                    variant="ghost"
                    onClick={() => setActiveZoneId(isActive ? null : zone.id)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 min-h-[44px] rounded-md text-sm font-medium h-auto',
                      isActive
                        ? 'text-app-text'
                        : 'text-app-text-muted hover:text-app-text-secondary',
                    )}
                  >
                    {zone.name}
                    <span className={cn('w-3 h-3 rounded-sm', dotColor)} />
                    {zs && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-app-elevated font-bold tabular-nums">
                        {zs.occupied}/{zs.total}
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>

            <div className="ml-auto flex items-center gap-4 text-xs text-app-text-muted shrink-0">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span className="font-medium tabular-nums">{avgDuration} min</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                <span className="font-medium tabular-nums">{stats.pct}%</span>
              </div>
            </div>
          </div>

          {/* Table grid */}
          <div className="flex-1 overflow-y-auto p-5" style={{ scrollbarWidth: 'none' }}>
            {zones.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <LayoutGrid className="w-12 h-12 text-app-text-muted mb-3" />
                <h3 className="text-lg font-bold text-app-text">{t('noZones')}</h3>
              </div>
            ) : (
              filteredZones.map((zone) => {
                const activeTables = zone.tables.filter((tbl) => tbl.is_active);
                if (activeTables.length === 0) return null;

                return (
                  <div key={zone.id} className="mb-6">
                    {!activeZoneId && (
                      <h2 className="text-sm font-bold text-app-text mb-3">{zone.name}</h2>
                    )}
                    <div className="grid grid-cols-2 @sm:grid-cols-3 @xl:grid-cols-4 gap-5">
                      {activeTables.map((table) => (
                        <VisualTable
                          key={table.id}
                          table={table}
                          assignment={getAssignmentForTable(table.id)}
                          servers={servers}
                          onAssign={handleAssign}
                          onRelease={handleRelease}
                          occupiedLabel={t('occupied')}
                          vacantLabel={t('vacant')}
                          assignLabel={t('assignServer')}
                          releaseLabel={t('release')}
                          releaseAriaLabel={t('releaseAssignment')}
                          assignAriaLabel={t('assignServer')}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            )}

            {/* Mobile-only sections */}
            <div className="@md:hidden space-y-4 pb-4">
              {readyOrders.length > 0 && (
                <div className="bg-app-card rounded-lg border border-status-warning/20 p-4">
                  <div className="flex items-center gap-2.5 mb-3">
                    <CheckCircle2 className="w-4 h-4 text-status-warning" />
                    <span className="text-sm font-bold text-app-text">{t('readyOrders')}</span>
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
                          <Button
                            onClick={() => handleMarkDelivered(order.id)}
                            aria-label={t('markDelivered')}
                            className="shrink-0 gap-1.5 min-h-[44px] bg-status-success text-white text-xs font-bold hover:bg-status-success/90"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            {t('markDelivered')}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {assignments.length > 0 && (
                <div className="bg-app-card rounded-lg border border-app-border p-4">
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
                        <span className="text-xs font-semibold text-app-text">
                          {a.server?.full_name ?? ' - '}
                        </span>
                        <span className="inline-flex items-center justify-center min-w-[32px] h-7 rounded-lg bg-status-success/15 text-status-success text-[10px] font-bold px-2 border border-status-success/20">
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
