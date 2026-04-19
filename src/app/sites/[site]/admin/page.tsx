import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import DashboardClient from '@/components/admin/DashboardClient';
import type { Order, DashboardStats } from '@/types/admin.types';
import type {
  DashboardBucketSeries,
  TopDishRecord,
  StockAlertRecord,
} from '@/types/dashboard.types';
import TenantNotFound from '@/components/admin/TenantNotFound';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

type DayBucket = { date: string; revenue: number; count: number };

function buildBuckets(
  orders: {
    total?: number | null;
    tip_amount?: number | null;
    created_at: string;
    status?: string;
  }[],
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
    buckets[key].count += 1;
    buckets[key].revenue += Number(o.total || 0) + Number(o.tip_amount || 0);
  }
  return Object.values(buckets);
}

const TREND_COLORS: ReadonlyArray<TopDishRecord['color']> = ['amber', 'indigo', 'lime', 'rose'];

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

  // Get current user's name for greeting
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  let userName: string | undefined;
  if (authUser) {
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('full_name')
      .eq('user_id', authUser.id)
      .eq('tenant_id', tenant.id)
      .single();
    userName = adminUser?.full_name || (authUser.user_metadata?.full_name as string);
  }

  let initialStats: DashboardStats = {
    ordersToday: 0,
    revenueToday: 0,
    activeItems: 0,
    activeCards: 0,
  };
  let initialRecentOrders: Order[] = [];
  let initialRevenueSparkline: { value: number }[] = [];
  let initialOrdersSparkline: { value: number }[] = [];
  let initialBuckets: DashboardBucketSeries = { week: [], month: [], quarter: [] };
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
    ] = await Promise.all([
      // Today's orders (stats)
      supabase
        .from('orders')
        .select('id, total, tip_amount, status, created_at')
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
          `id, order_number, table_number, status, total, tip_amount, created_at,
           order_items(id, quantity, price_at_order, menu_items(name))`,
        )
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(20),

      // Yesterday for delta
      supabase
        .from('orders')
        .select('id, total, tip_amount, status')
        .eq('tenant_id', tenant.id)
        .gte('created_at', yesterday.toISOString())
        .lt('created_at', today.toISOString()),

      // Last 90 days for chart buckets (week/month/quarter ranges)
      supabase
        .from('orders')
        .select('id, total, tip_amount, created_at, status')
        .eq('tenant_id', tenant.id)
        .gte('created_at', ninetyDaysAgo.toISOString()),

      // Top dishes over the last 7 days.
      // order_items has no tenant_id column and no indexable created_at —
      // filter both tenant AND time-range via the parent orders join
      // (matches prod pattern in src/hooks/queries/useReportData.ts:147-151).
      supabase
        .from('order_items')
        .select(
          `menu_item_id, quantity, price_at_order,
           menu_items(id, name, is_available, category:categories(name)),
           orders!inner(tenant_id, created_at)`,
        )
        .eq('orders.tenant_id', tenant.id)
        .gte('orders.created_at', sevenDaysAgo.toISOString()),

      // Low stock alerts
      supabase
        .from('ingredients')
        .select('id, name, current_stock, min_stock_alert, unit')
        .eq('tenant_id', tenant.id)
        .limit(60),

      // Active tables = venues.tables count vs occupied (best-effort; falls back to venues count)
      supabase.from('tables').select('id, status', { count: 'exact' }).eq('tenant_id', tenant.id),
    ]);

    // ─── Today stats ─────────────────────────────────────
    const ordersData = ordersRes.data || [];
    initialStats = {
      ordersToday: ordersData.length,
      revenueToday: ordersData
        .filter((o) => o.status === 'delivered')
        .reduce((sum, o) => sum + Number(o.total || 0) + Number(o.tip_amount || 0), 0),
      activeItems: itemsCountRes.count || 0,
      activeCards: venuesCountRes.count || 0,
    };

    // ─── Trend ───────────────────────────────────────────
    const yesterdayOrders = yesterdayRes.data || [];
    const yesterdayRevenue = yesterdayOrders
      .filter((o: Record<string, unknown>) => o.status === 'delivered')
      .reduce(
        (sum: number, o: Record<string, unknown>) =>
          sum + Number(o.total || 0) + Number(o.tip_amount || 0),
        0,
      );
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

    // ─── Chart buckets ──────────────────────────────────
    const quarterOrders = (quarterRes.data || []) as Array<{
      total?: number | null;
      tip_amount?: number | null;
      created_at: string;
      status?: string;
    }>;
    const dayBuckets90 = buildBuckets(quarterOrders, 90);
    const last7 = dayBuckets90.slice(-7);
    const last30 = dayBuckets90.slice(-30);
    initialBuckets = {
      week: last7,
      month: last30,
      quarter: dayBuckets90,
    };
    initialRevenueSparkline = last7.map((b) => ({ value: b.revenue }));
    initialOrdersSparkline = last7.map((b) => ({ value: b.count }));

    // ─── Recent orders ──────────────────────────────────
    initialRecentOrders = (recentOrdersRes.data || []).map((order: Record<string, unknown>) => ({
      id: order.id as string,
      tenant_id: tenant.id,
      order_number: (order.order_number as string) || undefined,
      table_number: (order.table_number as string) || 'N/A',
      status: ((order.status as string) || 'pending') as Order['status'],
      total_price: Number(order.total || 0),
      tip_amount: Number(order.tip_amount || 0),
      created_at: order.created_at as string,
      items: ((order.order_items as Array<Record<string, unknown>>) || []).map(
        (item: Record<string, unknown>) => ({
          id: item.id as string,
          name: ((item.menu_items as Record<string, unknown>)?.name as string) || 'Item inconnu',
          quantity: item.quantity as number,
          price: item.price_at_order as number,
        }),
      ),
    }));

    // ─── Top dishes (7d aggregation) ────────────────────
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

    // ─── Stock alerts ───────────────────────────────────
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

    // ─── Tables ────────────────────────────────────────
    const tablesList = (tablesRes.data || []) as Array<{ status?: string }>;
    activeTablesTotal = tablesRes.count ?? tablesList.length;
    activeTablesUsed = tablesList.filter(
      (t) => t.status && t.status !== 'free' && t.status !== 'available',
    ).length;
  } catch (err) {
    // logger signature: (message, error, context)
    logger.error(
      'Admin dashboard server fetch failed',
      err instanceof Error ? err : new Error(String(err)),
      { tenantId: tenant.id },
    );
    // Fallback with empty data (already initialized above)
  }

  return (
    <div className="h-full">
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
        initialTopDishes={initialTopDishes}
        initialStockAlerts={initialStockAlerts}
        initialActiveTables={{ used: activeTablesUsed, total: activeTablesTotal }}
        currency={tenant.currency}
        establishmentType={tenant.establishment_type ?? 'restaurant'}
      />
    </div>
  );
}
