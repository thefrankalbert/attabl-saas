import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import { getAdminPermission } from '@/lib/auth/require-admin-permission';
import DashboardClient from '@/components/admin/DashboardClient';
import type { Order, DashboardStats } from '@/types/admin.types';
import type {
  DashboardBucketSeries,
  DashboardChannelSeries,
  TopDishRecord,
  StockAlertRecord,
} from '@/types/dashboard.types';
import type { ServiceType } from '@/types/admin.types';
import TenantNotFound from '@/components/admin/TenantNotFound';
import { logger } from '@/lib/logger';
import {
  averageLedgerTicket,
  ledgerValue,
  PAYMENT_STATUSES_WITH_MONEY,
  sumLedgerNet,
} from '@/lib/orders/revenue';

export const dynamic = 'force-dynamic';

type DayBucket = { date: string; revenue: number; count: number };

type LedgerEntry = {
  amount?: number | null;
  status?: string | null;
  created_at: string;
  order_id?: string | null;
};

function buildBuckets(
  orders: { created_at: string }[],
  payments: LedgerEntry[],
  days: number,
): DayBucket[] {
  const buckets: Record<string, DayBucket> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const key = d.toISOString().slice(0, 10);
    buckets[key] = { date: key, revenue: 0, count: 0 };
  }
  for (const o of orders) {
    const key = o.created_at?.slice(0, 10);
    if (!key || !buckets[key]) continue;
    // count = orders placed (all).
    buckets[key].count += 1;
  }
  for (const p of payments) {
    // revenue = money received that day (ledger, src/lib/orders/revenue.ts).
    const key = p.created_at?.slice(0, 10);
    if (key && buckets[key]) buckets[key].revenue += ledgerValue(p);
  }
  return Object.values(buckets);
}

type ChannelBucket = { date: string; surplace: number; emporter: number };

function buildChannelBuckets(
  payments: Array<LedgerEntry & { orders?: { service_type?: ServiceType | null } | null }>,
  days: number,
): ChannelBucket[] {
  const buckets: Record<string, ChannelBucket> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const key = d.toISOString().slice(0, 10);
    buckets[key] = { date: key, surplace: 0, emporter: 0 };
  }
  for (const p of payments) {
    const key = p.created_at?.slice(0, 10);
    if (!key || !buckets[key]) continue;
    // Revenue split = money received that day, by the order's service mode.
    const amount = ledgerValue(p);
    const serviceType = p.orders?.service_type;
    // dine_in + room_service -> Sur place ; takeaway + delivery -> A emporter
    const emporter = serviceType === 'takeaway' || serviceType === 'delivery';
    if (emporter) buckets[key].emporter += amount;
    else buckets[key].surplace += amount;
  }
  return Object.values(buckets);
}

const TREND_COLORS: ReadonlyArray<TopDishRecord['color']> = ['amber', 'indigo', 'violet', 'rose'];

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '??';
}

export default async function AdminDashboard({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);
  if (!tenant) {
    return <TenantNotFound />;
  }

  const supabase = await createClient();

  // Get current user for greeting. The admin_users name lookup is folded into the
  // dashboard Promise.all below (it only needs authUser.id) instead of blocking it.
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  // Metadata fallback set up front so a dashboard-batch failure still greets the user.
  let userName = authUser?.user_metadata?.full_name as string | undefined;

  let initialStats: DashboardStats = {
    ordersToday: 0,
    revenueToday: 0,
    avgTicketToday: 0,
    activeItems: 0,
    activeCards: 0,
  };
  let initialRecentOrders: Order[] = [];
  let initialRevenueSparkline: { value: number }[] = [];
  let initialOrdersSparkline: { value: number }[] = [];
  let initialBuckets: DashboardBucketSeries = { week: [], month: [], quarter: [] };
  let initialChannelBuckets: DashboardChannelSeries = { week: [], month: [], quarter: [] };
  let initialTopDishes: TopDishRecord[] = [];
  let initialStockAlerts: StockAlertRecord[] = [];
  let activeTablesTotal = 0;
  let activeTablesUsed = 0;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    ninetyDaysAgo.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [
      ordersRes,
      itemsCountRes,
      venuesCountRes,
      recentOrdersRes,
      yesterdayRes,
      quarterRes,
      topDishesRes,
      lowStockRes,
      tablesRes,
      openSessionsRes,
      adminUserRes,
      todayPaymentsRes,
      yesterdayPaymentsRes,
      quarterPaymentsRes,
    ] = await Promise.all([
      // Today's orders (stats)
      supabase
        .from('orders')
        .select('id, total, tip_amount, status, payment_status, created_at')
        .eq('tenant_id', tenant.id)
        .gte('created_at', today.toISOString()),

      // Active items count
      supabase
        .from('menu_items')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('is_available', true),

      // Active venues count
      supabase
        .from('venues')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('is_active', true),

      // Recent orders feed (live)
      supabase
        .from('orders')
        .select(
          `id, order_number, table_number, status, total, tip_amount, created_at, service_type, payment_status,
           order_items(id, quantity, price_at_order, menu_items(name))`,
        )
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(20),

      // Yesterday for delta
      supabase
        .from('orders')
        .select('id, total, tip_amount, status, payment_status')
        .eq('tenant_id', tenant.id)
        .gte('created_at', yesterday.toISOString())
        .lt('created_at', today.toISOString()),

      // Last 90 days for chart buckets (week/month/quarter ranges)
      supabase
        .from('orders')
        .select('id, total, tip_amount, created_at, status, payment_status, service_type')
        .eq('tenant_id', tenant.id)
        .gte('created_at', ninetyDaysAgo.toISOString()),

      // Top dishes over the last 7 days.
      // order_items has no tenant_id column and no indexable created_at -
      // filter both tenant AND time-range via the parent orders join
      // (matches prod pattern in src/hooks/queries/useReportData.ts:147-151).
      supabase
        .from('order_items')
        .select(
          `menu_item_id, quantity, price_at_order,
           menu_items(id, name, is_available, category:categories(name)),
           orders!inner(tenant_id, created_at, payment_status)`,
        )
        .eq('orders.tenant_id', tenant.id)
        .in('orders.payment_status', [...PAYMENT_STATUSES_WITH_MONEY])
        .gte('orders.created_at', sevenDaysAgo.toISOString()),

      // Low stock alerts
      supabase
        .from('ingredients')
        .select('id, name, current_stock, min_stock_alert, unit')
        .eq('tenant_id', tenant.id)
        .limit(60),

      // Active tables total. The `tables` table has no `status` column
      // (occupancy is derived, see components/admin/service/service-status.ts),
      // so total = count of active tables...
      supabase
        .from('tables')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('is_active', true),

      // ...and occupied = tables with an open service session (the canonical
      // "table is busy until fully settled" marker from the payment refonte).
      supabase
        .from('table_sessions')
        .select('table_number')
        .eq('tenant_id', tenant.id)
        .eq('status', 'open'),

      // Current user's display name for the greeting - folded into the batch
      // (only needs authUser.id). .single() resolves with {data,error}, so a
      // missing row never rejects the Promise.all.
      authUser
        ? supabase
            .from('admin_users')
            .select('full_name')
            .eq('user_id', authUser.id)
            .eq('tenant_id', tenant.id)
            .single()
        : Promise.resolve({ data: null as { full_name: string | null } | null }),

      // Money received (payments ledger, owner decision C-041): today,
      // yesterday, and the 90-day window for the charts.
      supabase
        .from('payments')
        .select('order_id, amount, status, created_at')
        .eq('tenant_id', tenant.id)
        .gte('created_at', today.toISOString()),
      supabase
        .from('payments')
        .select('order_id, amount, status, created_at')
        .eq('tenant_id', tenant.id)
        .gte('created_at', yesterday.toISOString())
        .lt('created_at', today.toISOString()),
      supabase
        .from('payments')
        .select('amount, status, created_at, orders(service_type)')
        .eq('tenant_id', tenant.id)
        .gte('created_at', ninetyDaysAgo.toISOString()),
    ]);

    userName = adminUserRes.data?.full_name || userName;

    // --- Today stats -------------------------------------
    const ordersData = ordersRes.data || [];
    const todayPayments = todayPaymentsRes.data || [];
    initialStats = {
      ordersToday: ordersData.length,
      // Revenue = money received today (payments ledger, shared with the RPCs).
      revenueToday: sumLedgerNet(todayPayments),
      avgTicketToday: averageLedgerTicket(todayPayments),
      activeItems: itemsCountRes.count || 0,
      activeCards: venuesCountRes.count || 0,
    };

    // --- Trend -------------------------------------------
    const yesterdayOrders = yesterdayRes.data || [];
    const yesterdayPayments = yesterdayPaymentsRes.data || [];
    const yesterdayRevenue = sumLedgerNet(yesterdayPayments);
    const yesterdayCount = yesterdayOrders.length;
    if (yesterdayCount > 0) {
      initialStats.ordersTrend = Math.round(
        ((initialStats.ordersToday - yesterdayCount) / yesterdayCount) * 100,
      );
    }
    if (yesterdayRevenue > 0) {
      initialStats.revenueTrend = Math.round(
        ((initialStats.revenueToday - yesterdayRevenue) / yesterdayRevenue) * 100,
      );
    }
    const yesterdayTicket = averageLedgerTicket(yesterdayPayments);
    if (yesterdayTicket > 0) {
      initialStats.avgTicketTrend = Math.round(
        ((initialStats.avgTicketToday - yesterdayTicket) / yesterdayTicket) * 100,
      );
    }

    // --- Chart buckets ----------------------------------
    const quarterOrders = (quarterRes.data || []) as Array<{ created_at: string }>;
    const quarterPayments = (quarterPaymentsRes.data || []) as unknown as Array<
      LedgerEntry & { orders?: { service_type?: ServiceType | null } | null }
    >;
    const dayBuckets90 = buildBuckets(quarterOrders, quarterPayments, 90);
    const last7 = dayBuckets90.slice(-7);
    const last30 = dayBuckets90.slice(-30);
    initialBuckets = {
      week: last7,
      month: last30,
      quarter: dayBuckets90,
    };

    const channelBuckets90 = buildChannelBuckets(quarterPayments, 90);
    initialChannelBuckets = {
      week: channelBuckets90.slice(-7),
      month: channelBuckets90.slice(-30),
      quarter: channelBuckets90,
    };
    initialRevenueSparkline = last7.map((b) => ({ value: b.revenue }));
    initialOrdersSparkline = last7.map((b) => ({ value: b.count }));

    // --- Recent orders ----------------------------------
    initialRecentOrders = (recentOrdersRes.data || []).map((order: Record<string, unknown>) => ({
      id: order.id as string,
      tenant_id: tenant.id,
      order_number: (order.order_number as string) || undefined,
      table_number: (order.table_number as string) || 'N/A',
      status: ((order.status as string) || 'pending') as Order['status'],
      total_price: Number(order.total || 0),
      tip_amount: Number(order.tip_amount || 0),
      created_at: order.created_at as string,
      service_type: (order.service_type as Order['service_type']) || undefined,
      payment_status: (order.payment_status as Order['payment_status']) || undefined,
      items: ((order.order_items as Array<Record<string, unknown>>) || []).map(
        (item: Record<string, unknown>) => ({
          id: item.id as string,
          name: ((item.menu_items as Record<string, unknown>)?.name as string) || 'Item inconnu',
          quantity: item.quantity as number,
          price: item.price_at_order as number,
        }),
      ),
    }));

    // --- Top dishes (7d aggregation) --------------------
    const dishMap = new Map<string, TopDishRecord>();
    for (const row of topDishesRes.data || []) {
      const r = row as Record<string, unknown>;
      const menuItem = r.menu_items as
        | { id?: string; name?: string; is_available?: boolean; category?: { name?: string } }
        | undefined;
      if (!menuItem?.id) continue;
      const existing = dishMap.get(menuItem.id);
      const qty = Number(r.quantity || 0);
      const price = Number(r.price_at_order || 0);
      // Day bucket from the joined orders row, not order_items.created_at
      // (that column is not indexed / not reliably present).
      const ordersJoin = r.orders as { created_at?: string } | undefined;
      const dayKey = ordersJoin?.created_at?.slice(0, 10);
      if (existing) {
        existing.portions += qty;
        existing.revenue += qty * price;
        if (dayKey) existing.dayCounts[dayKey] = (existing.dayCounts[dayKey] || 0) + qty;
      } else {
        const idx = dishMap.size;
        dishMap.set(menuItem.id, {
          id: menuItem.id,
          name: menuItem.name || 'Plat inconnu',
          category: menuItem.category?.name || 'Autre',
          portions: qty,
          revenue: qty * price,
          dayCounts: dayKey ? { [dayKey]: qty } : {},
          color: TREND_COLORS[idx % TREND_COLORS.length],
          initials: initialsFor(menuItem.name || '?'),
          available: menuItem.is_available !== false,
        });
      }
    }
    initialTopDishes = Array.from(dishMap.values())
      .sort((a, b) => b.portions - a.portions)
      .slice(0, 5);

    // --- Stock alerts -----------------------------------
    const rawAlerts: StockAlertRecord[] = [];
    for (const row of (lowStockRes.data || []) as Array<Record<string, unknown>>) {
      const name = (row.name as string) || '';
      const current = Number(row.current_stock || 0);
      const threshold = Number(row.min_stock_alert || 0);
      const unit = (row.unit as string) || '';
      if (threshold <= 0) continue;
      if (current > threshold) continue;
      const level: StockAlertRecord['level'] = current <= 0 ? 'err' : 'warn';
      rawAlerts.push({ id: row.id as string, level, title: name, current, threshold, unit });
    }
    initialStockAlerts = rawAlerts.sort((a, b) => a.current - b.current).slice(0, 3);

    // --- Tables ----------------------------------------
    activeTablesTotal = tablesRes.count ?? 0;
    const openSessions = (openSessionsRes.data || []) as Array<{ table_number: string | null }>;
    // Distinct tables with an open session (guard against >1 row per table).
    const occupied = new Set(
      openSessions.map((s) => s.table_number).filter((n): n is string => Boolean(n)),
    ).size;
    activeTablesUsed = Math.min(occupied, activeTablesTotal);
  } catch (err) {
    // logger signature: (message, error, context)
    logger.error(
      'Admin dashboard server fetch failed',
      err instanceof Error ? err : new Error(String(err)),
      { tenantId: tenant.id },
    );
    // Fallback with empty data (already initialized above)
  }

  // RBAC: revenue/financial widgets are restricted to roles with `reports.view`
  // (owner/admin/manager). The dashboard stays reachable for every role, but
  // cashier/chef/waiter must not see revenue, so blank the financial fields
  // server-side (never ship the data in props/HTML).
  const canSeeRevenue = await getAdminPermission(site, 'reports.view');
  if (!canSeeRevenue) {
    initialStats = {
      ...initialStats,
      revenueToday: 0,
      revenueTrend: undefined,
      avgTicketToday: 0,
      avgTicketTrend: undefined,
    };
    initialRevenueSparkline = [];
    initialBuckets = { week: [], month: [], quarter: [] };
    initialChannelBuckets = { week: [], month: [], quarter: [] };
    initialTopDishes = [];
  }

  return (
    <div className="flex-1 min-h-0">
      <DashboardClient
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        tenantName={tenant.name}
        userName={userName}
        initialStats={initialStats}
        initialRecentOrders={initialRecentOrders}
        initialPopularItems={[]}
        initialRevenueSparkline={initialRevenueSparkline}
        initialOrdersSparkline={initialOrdersSparkline}
        initialBuckets={initialBuckets}
        initialChannelBuckets={initialChannelBuckets}
        initialTopDishes={initialTopDishes}
        initialStockAlerts={initialStockAlerts}
        initialActiveTables={{ used: activeTablesUsed, total: activeTablesTotal }}
        currency={tenant.currency}
        establishmentType={tenant.establishment_type ?? 'restaurant'}
      />
    </div>
  );
}
