import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import DashboardClient from '@/components/admin/DashboardClient';
import type { Order, DashboardStats } from '@/types/admin.types';
import TenantNotFound from '@/components/admin/TenantNotFound';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  // Récupérer le tenant
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

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Parallel queries — each is independent so we handle errors per-query
    const [ordersRes, itemsCountRes, venuesCountRes, recentOrdersRes, yesterdayRes, weekRes] =
      await Promise.all([
        // Today's orders (for stats)
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

        // Recent orders
        supabase
          .from('orders')
          .select(
            `id, table_number, status, total, tip_amount, created_at,
           order_items(id, quantity, price_at_order, menu_items(name))`,
          )
          .eq('tenant_id', tenant.id)
          .order('created_at', { ascending: false })
          .limit(8),

        // Yesterday's orders for trend
        supabase
          .from('orders')
          .select('id, total, tip_amount, status')
          .eq('tenant_id', tenant.id)
          .gte('created_at', yesterday.toISOString())
          .lt('created_at', today.toISOString()),

        // Last 7 days for sparklines (computed server-side for instant chart paint)
        supabase
          .from('orders')
          .select('id, total, tip_amount, created_at, status')
          .eq('tenant_id', tenant.id)
          .gte('created_at', sevenDaysAgo.toISOString()),
      ]);

    // Stats
    const ordersData = ordersRes.data || [];
    initialStats = {
      ordersToday: ordersData.length,
      revenueToday: ordersData
        .filter((o) => o.status === 'delivered')
        .reduce((sum, o) => sum + Number(o.total || 0) + Number(o.tip_amount || 0), 0),
      activeItems: itemsCountRes.count || 0,
      activeCards: venuesCountRes.count || 0,
    };

    // Trend comparison
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

    // Sparklines: bucket 7-day orders by date for instant chart rendering
    const weekOrders = (weekRes.data || []) as Array<Record<string, unknown>>;
    const dayBuckets: Record<string, { revenue: number; count: number }> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const key = d.toISOString().slice(0, 10);
      dayBuckets[key] = { revenue: 0, count: 0 };
    }
    for (const o of weekOrders) {
      const key = (o.created_at as string)?.slice(0, 10);
      if (key && dayBuckets[key]) {
        dayBuckets[key].count++;
        dayBuckets[key].revenue += Number(o.total || 0) + Number(o.tip_amount || 0);
      }
    }
    const bucketValues = Object.values(dayBuckets);
    initialRevenueSparkline = bucketValues.map((b) => ({ value: b.revenue }));
    initialOrdersSparkline = bucketValues.map((b) => ({ value: b.count }));

    // Recent Orders
    initialRecentOrders = (recentOrdersRes.data || []).map((order: Record<string, unknown>) => ({
      id: order.id as string,
      tenant_id: tenant.id,
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
  } catch {
    // Fallback with empty data (already initialized above)
  }

  return (
    <div className="max-w-7xl mx-auto">
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
        currency={tenant.currency}
        establishmentType={tenant.establishment_type ?? 'restaurant'}
      />
    </div>
  );
}
