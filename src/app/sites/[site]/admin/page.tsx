import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { getTenantDayStart, resolveTenantTimezone } from '@/lib/timezones';
import { headers } from 'next/headers';
import { getAdminPermission, requireAdminMember } from '@/lib/auth/require-admin-permission';
import DashboardClient from '@/components/admin/DashboardClient';
import type { Order, DashboardStats } from '@/types/admin.types';
import type { DashboardChannelSeries } from '@/types/dashboard.types';
import TenantNotFound from '@/components/admin/TenantNotFound';
import { logger } from '@/lib/logger';
import { averageLedgerTicket, sumLedgerNet } from '@/lib/orders/revenue';
import { buildChannelBuckets, fetchChartPayments } from '@/lib/dashboard/channel-buckets';
import { getTranslations } from 'next-intl/server';
import AdminSrTitle from '@/components/admin/AdminSrTitle';
import { adminPageMetadata } from '@/lib/admin-page-metadata';

export async function generateMetadata() {
  return adminPageMetadata('sidebar', 'navDashboard');
}

export const dynamic = 'force-dynamic';

/** Lignes de la liste des commandes du jour sur le tableau de bord. */
const RECENT_ORDERS_LIMIT = 200;

export default async function AdminDashboard({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  await requireAdminMember(site);
  const tTitle = await getTranslations('sidebar');
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
  let initialRecentOrdersTotal = 0;
  let initialChannelBuckets: DashboardChannelSeries = { week: [], month: [], quarter: [] };
  let activeTablesTotal = 0;
  let activeTablesUsed = 0;

  const canSeeRevenue = await getAdminPermission(site, 'reports.money');

  try {
    // Journee de caisse = journee DU RESTAURANT (audit R-02), pas minuit du
    // serveur (UTC) ni de l'appareil de la personne connectee.
    const today = getTenantDayStart(tenant);
    const yesterday = getTenantDayStart(tenant, 1);
    const ninetyDaysAgo = getTenantDayStart(tenant, 89);

    const [
      ordersRes,
      itemsCountRes,
      venuesCountRes,
      recentOrdersRes,
      yesterdayRes,
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

      // Commandes du jour du restaurant (periode "Aujourd'hui" du selecteur;
      // les autres periodes sont lues par le client, voir useDashboardStats).
      supabase
        .from('orders')
        .select(
          `id, order_number, table_number, status, total, tip_amount, created_at, service_type, payment_status,
           order_items(id, quantity, price_at_order, menu_items(name))`,
          { count: 'exact' },
        )
        .eq('tenant_id', tenant.id)
        .gte('created_at', today.toISOString())
        .order('created_at', { ascending: false })
        .limit(RECENT_ORDERS_LIMIT),

      // Yesterday for delta
      supabase
        .from('orders')
        .select('id, total, tip_amount, status, payment_status')
        .eq('tenant_id', tenant.id)
        .gte('created_at', yesterday.toISOString())
        .lt('created_at', today.toISOString()),

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
      canSeeRevenue
        ? fetchChartPayments(supabase, tenant.id, ninetyDaysAgo.toISOString())
        : Promise.resolve({ data: [] }),
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

    // --- Chart buckets (90 jours du restaurant) ----------
    const quarterPayments = quarterPaymentsRes.data;
    const dayStarts = Array.from({ length: 90 }, (_, i) => getTenantDayStart(tenant, 89 - i));
    const channelBuckets90 = buildChannelBuckets(
      quarterPayments,
      dayStarts,
      resolveTenantTimezone(tenant),
    );
    initialChannelBuckets = {
      week: channelBuckets90.slice(-7),
      month: channelBuckets90.slice(-30),
      quarter: channelBuckets90,
    };

    // --- Recent orders ----------------------------------
    initialRecentOrdersTotal = recentOrdersRes.count ?? (recentOrdersRes.data || []).length;
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

  // RBAC: revenue/financial widgets are restricted to roles with `reports.money`
  // (owner and manager by default). The dashboard stays reachable for every role, but
  // cashier/chef/waiter must not see revenue, so blank the financial fields
  // server-side (never ship the data in props/HTML). `canSeeRevenue` est lu
  // AVANT les requetes: le graphique de 90 jours n'est meme pas charge sans.
  if (!canSeeRevenue) {
    initialStats = {
      ...initialStats,
      revenueToday: 0,
      revenueTrend: undefined,
      avgTicketToday: 0,
      avgTicketTrend: undefined,
    };
    initialChannelBuckets = { week: [], month: [], quarter: [] };
  }

  return (
    <div className="flex-1 min-h-0">
      <AdminSrTitle label={tTitle('navDashboard')} />
      <DashboardClient
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        tenantName={tenant.name}
        userName={userName}
        initialStats={initialStats}
        initialRecentOrders={initialRecentOrders}
        initialRecentOrdersTotal={initialRecentOrdersTotal}
        initialChannelBuckets={initialChannelBuckets}
        initialActiveTables={{ used: activeTablesUsed, total: activeTablesTotal }}
        currency={tenant.currency}
        timeZone={resolveTenantTimezone(tenant)}
        establishmentType={tenant.establishment_type ?? 'restaurant'}
      />
    </div>
  );
}
