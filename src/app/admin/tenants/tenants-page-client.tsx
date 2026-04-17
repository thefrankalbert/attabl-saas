'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LoadingIndicator } from '@/components/application/loading-indicator/LoadingIndicator';
import { AddRestaurantWizard } from '@/components/admin/AddRestaurantWizard';
import { CommandCenterTopBar } from '@/components/admin/tenants/CommandCenterTopBar';
import { CommandCenterHero } from '@/components/admin/tenants/CommandCenterHero';
import { NetworkTrendCard } from '@/components/admin/tenants/NetworkTrendCard';
import { LocationsGrid } from '@/components/admin/tenants/LocationsGrid';
import { AlertCenterCard } from '@/components/admin/tenants/AlertCenterCard';
import { LiveFeedCard } from '@/components/admin/tenants/LiveFeedCard';
import type { OwnerDashboardRow } from '@/types/restaurant-group.types';
import type {
  ChartDataPoint,
  ChartMode,
  ChartPeriod,
  CommandCenterAlert,
  CommandCenterGlobals,
  LocationStat,
  RecentOrder,
  Tenant,
} from '@/types/command-center.types';

interface TenantsPageClientProps {
  serverMode: 'superadmin' | 'owner';
  serverUserName: string;
  serverTenants?: Tenant[];
  serverRestaurants?: OwnerDashboardRow[];
}

interface OrderRow {
  id: string;
  order_number: string | null;
  total: number | string | null;
  status: string | null;
  created_at: string;
  tenant_id: string;
}

export default function TenantsPageClient({
  serverMode,
  serverUserName,
  serverTenants,
  serverRestaurants,
}: TenantsPageClientProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const baseTenants: Tenant[] = useMemo(() => {
    if (serverMode === 'superadmin') return serverTenants || [];
    return (serverRestaurants || []).map((r) => ({
      id: r.tenant_id,
      slug: r.tenant_slug,
      name: r.tenant_name,
      subscription_status: r.tenant_status || '',
      subscription_plan: r.tenant_plan || '',
      is_active: r.tenant_is_active,
    }));
  }, [serverMode, serverTenants, serverRestaurants]);

  const logoBySlug = useMemo(() => {
    const map = new Map<string, string | null>();
    (serverRestaurants || []).forEach((r) => map.set(r.tenant_slug, r.tenant_logo_url));
    return map;
  }, [serverRestaurants]);

  const [loading, setLoading] = useState(baseTenants.length > 0);
  const [locations, setLocations] = useState<LocationStat[]>([]);
  const [globals, setGlobals] = useState<CommandCenterGlobals>({
    total_locations: baseTenants.length,
    active_locations: baseTenants.filter((t) => t.is_active).length,
    revenue_today: 0,
    revenue_yesterday: 0,
    orders_today: 0,
    orders_yesterday: 0,
    alerts_count: 0,
  });
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('day');
  const [chartMode, setChartMode] = useState<ChartMode>('revenue');
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [alerts, setAlerts] = useState<CommandCenterAlert[]>([]);
  const [showWizard, setShowWizard] = useState(false);

  const tenantIds = useMemo(() => baseTenants.map((t) => t.id), [baseTenants]);
  const tenantById = useMemo(() => {
    const map = new Map<string, Tenant>();
    baseTenants.forEach((t) => map.set(t.id, t));
    return map;
  }, [baseTenants]);

  const fetchAll = useCallback(async () => {
    if (tenantIds.length === 0) return;
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startYesterday = new Date(startToday);
    startYesterday.setDate(startYesterday.getDate() - 1);

    const [todayRes, yesterdayRes, recentRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id, order_number, total, status, created_at, tenant_id')
        .in('tenant_id', tenantIds)
        .gte('created_at', startToday.toISOString()),
      supabase
        .from('orders')
        .select('id, total, status, tenant_id, created_at')
        .in('tenant_id', tenantIds)
        .gte('created_at', startYesterday.toISOString())
        .lt('created_at', startToday.toISOString()),
      supabase
        .from('orders')
        .select('id, order_number, total, status, created_at, tenant_id, tenants(name, slug)')
        .in('tenant_id', tenantIds)
        .order('created_at', { ascending: false })
        .limit(8),
    ]);

    const todayOrders = (todayRes.data || []) as OrderRow[];
    const yesterdayOrders = (yesterdayRes.data || []) as OrderRow[];

    const byTenant = new Map<
      string,
      { revenue: number; orders: number; sparkline: number[] }
    >();
    tenantIds.forEach((id) =>
      byTenant.set(id, { revenue: 0, orders: 0, sparkline: new Array(24).fill(0) }),
    );
    for (const o of todayOrders) {
      if (o.status === 'cancelled') continue;
      const bucket = byTenant.get(o.tenant_id);
      if (!bucket) continue;
      bucket.revenue += Number(o.total) || 0;
      bucket.orders += 1;
      const h = new Date(o.created_at).getHours();
      bucket.sparkline[h] = (bucket.sparkline[h] || 0) + (Number(o.total) || 0);
    }

    const byTenantYesterday = new Map<string, { revenue: number; orders: number }>();
    tenantIds.forEach((id) => byTenantYesterday.set(id, { revenue: 0, orders: 0 }));
    for (const o of yesterdayOrders) {
      if (o.status === 'cancelled') continue;
      const bucket = byTenantYesterday.get(o.tenant_id);
      if (!bucket) continue;
      bucket.revenue += Number(o.total) || 0;
      bucket.orders += 1;
    }

    const computedLocations: LocationStat[] = baseTenants.map((t) => {
      const today = byTenant.get(t.id) || { revenue: 0, orders: 0, sparkline: [] };
      const yesterday = byTenantYesterday.get(t.id) || { revenue: 0, orders: 0 };
      return {
        tenant_id: t.id,
        tenant_slug: t.slug,
        tenant_name: t.name,
        tenant_plan: t.subscription_plan || null,
        tenant_logo_url: logoBySlug.get(t.slug) || null,
        is_active: t.is_active,
        revenue_today: today.revenue,
        revenue_yesterday: yesterday.revenue,
        orders_today: today.orders,
        orders_yesterday: yesterday.orders,
        sparkline: today.sparkline.slice(0, now.getHours() + 1),
      };
    });
    setLocations(computedLocations);

    const totalRevenueToday = computedLocations.reduce((s, l) => s + l.revenue_today, 0);
    const totalRevenueYesterday = computedLocations.reduce((s, l) => s + l.revenue_yesterday, 0);
    const totalOrdersToday = computedLocations.reduce((s, l) => s + l.orders_today, 0);
    const totalOrdersYesterday = computedLocations.reduce((s, l) => s + l.orders_yesterday, 0);

    const cancelledAlerts: CommandCenterAlert[] = todayOrders
      .filter((o) => o.status === 'cancelled')
      .slice(0, 4)
      .map((o) => {
        const t = tenantById.get(o.tenant_id);
        return {
          id: o.id,
          kind: 'payment' as const,
          label: `Commande #${o.order_number || o.id.slice(0, 6)} annulee`,
          tenant_name: t?.name || '',
          tenant_slug: t?.slug || '',
          severity: 'error' as const,
          created_at: o.created_at,
        };
      });
    const offlineAlerts: CommandCenterAlert[] = baseTenants
      .filter((t) => !t.is_active)
      .slice(0, 4)
      .map((t) => ({
        id: `offline-${t.id}`,
        kind: 'offline' as const,
        label: 'Site desactive',
        tenant_name: t.name,
        tenant_slug: t.slug,
        severity: 'warn' as const,
        created_at: new Date().toISOString(),
      }));
    const allAlerts = [...offlineAlerts, ...cancelledAlerts];
    setAlerts(allAlerts);

    setGlobals({
      total_locations: baseTenants.length,
      active_locations: baseTenants.filter((t) => t.is_active).length,
      revenue_today: totalRevenueToday,
      revenue_yesterday: totalRevenueYesterday,
      orders_today: totalOrdersToday,
      orders_yesterday: totalOrdersYesterday,
      alerts_count: allAlerts.length,
    });

    const recentRaw = (recentRes.data || []) as unknown as Array<
      OrderRow & { tenants: { name: string; slug: string } | null }
    >;
    setRecentOrders(
      recentRaw.map((o) => {
        const joined = o.tenants as unknown as { name: string; slug: string } | null;
        return {
          id: o.id,
          order_number: o.order_number || ' - ',
          total: Number(o.total) || 0,
          status: o.status || 'pending',
          created_at: o.created_at,
          tenant_name: joined?.name || tenantById.get(o.tenant_id)?.name || '',
          tenant_slug: joined?.slug || tenantById.get(o.tenant_id)?.slug || '',
        };
      }),
    );

    setLoading(false);
  }, [supabase, tenantIds, baseTenants, logoBySlug, tenantById]);

  const fetchChart = useCallback(
    async (period: ChartPeriod) => {
      if (tenantIds.length === 0) return;
      const now = new Date();
      let startDate: Date;
      let groupBy: 'hour' | 'day';
      if (period === 'day') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        groupBy = 'hour';
      } else if (period === 'week') {
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);
        groupBy = 'day';
      } else {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        groupBy = 'day';
      }

      const { data } = await supabase
        .from('orders')
        .select('total, created_at, status')
        .in('tenant_id', tenantIds)
        .gte('created_at', startDate.toISOString())
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true });

      const buckets = new Map<string, { revenue: number; orders: number }>();
      if (groupBy === 'hour') {
        for (let h = 0; h <= now.getHours(); h++) buckets.set(`${h}h`, { revenue: 0, orders: 0 });
        for (const o of data || []) {
          const key = `${new Date(o.created_at).getHours()}h`;
          const b = buckets.get(key);
          if (b) {
            b.revenue += Number(o.total) || 0;
            b.orders += 1;
          }
        }
      } else {
        const cursor = new Date(startDate);
        while (cursor <= now) {
          const key = `${cursor.getDate()}/${cursor.getMonth() + 1}`;
          buckets.set(key, { revenue: 0, orders: 0 });
          cursor.setDate(cursor.getDate() + 1);
        }
        for (const o of data || []) {
          const d = new Date(o.created_at);
          const key = `${d.getDate()}/${d.getMonth() + 1}`;
          const b = buckets.get(key);
          if (b) {
            b.revenue += Number(o.total) || 0;
            b.orders += 1;
          }
        }
      }
      setChartData(
        Array.from(buckets.entries()).map(([label, v]) => ({
          label,
          revenue: v.revenue,
          orders: v.orders,
        })),
      );
    },
    [supabase, tenantIds],
  );

  // Initial multi-query data load. All setState calls inside fetchAll / fetchChart
  // happen after an `await` boundary; the react-hooks/set-state-in-effect rule does
  // not trace async control flow so it flags the call site. Accepted deviation for
  // initial data fetching pattern.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchChart(chartPeriod);
  }, [fetchChart, chartPeriod]);

  const handleOpenDashboard = useCallback(
    (slug: string) => router.push(`/sites/${slug}/admin`),
    [router],
  );
  const handleOpenMenu = useCallback((slug: string) => router.push(`/sites/${slug}`), [router]);
  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    router.push('/login');
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-app-bg">
        <LoadingIndicator type="dot-circle" size="lg" className="text-app-text-muted" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-app-bg">
      <CommandCenterTopBar
        mode={serverMode}
        userName={serverUserName}
        ordersLiveCount={globals.orders_today}
        onLogout={handleLogout}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <CommandCenterHero globals={globals} />

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-3">
          <div className="flex min-h-0 flex-col px-3 py-2 sm:px-4 lg:col-span-2 lg:border-r lg:border-app-border">
            <NetworkTrendCard
              data={chartData}
              period={chartPeriod}
              mode={chartMode}
              onPeriodChange={setChartPeriod}
              onModeChange={setChartMode}
            />
            <LocationsGrid
              locations={locations}
              onOpenDashboard={handleOpenDashboard}
              onOpenMenu={handleOpenMenu}
              onAdd={serverMode === 'owner' ? () => setShowWizard(true) : undefined}
            />
          </div>

          <div className="flex min-h-0 flex-col px-3 py-2 sm:px-4">
            <AlertCenterCard alerts={alerts} onSelectTenant={handleOpenDashboard} />
            <LiveFeedCard
              orders={recentOrders}
              multiTenant={baseTenants.length > 1}
              onSelectTenant={handleOpenDashboard}
            />
          </div>
        </div>
      </div>

      {showWizard && (
        <AddRestaurantWizard
          onClose={() => setShowWizard(false)}
          onSuccess={(slug) => {
            setShowWizard(false);
            router.push(`/sites/${slug}/admin`);
          }}
        />
      )}
    </div>
  );
}
