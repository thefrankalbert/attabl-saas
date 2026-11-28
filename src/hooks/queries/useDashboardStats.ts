'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logger';
import { getDayStartInZone } from '@/lib/timezones';
import { averageLedgerTicket, sumLedgerNet, type LedgerRow } from '@/lib/orders/revenue';
import type { DashboardStats, Order } from '@/types/admin.types';

interface DashboardData {
  stats: DashboardStats;
  recentOrders: Order[];
  /**
   * Nombre TOTAL de commandes de la periode. La liste s'arrete a
   * RECENT_ORDERS_LIMIT: l'ecart est annonce au lieu d'etre tu (contre-audit
   * du lot 4, meme defaut que DASH-03).
   */
  recentOrdersTotal: number;
}

/** Periodes du selecteur de l'en-tete (`?range=`). */
export type DashboardRange = 'today' | 'yesterday' | '7d' | '30d';

/** Lignes de la liste des commandes, pour la periode choisie. */
export const RECENT_ORDERS_LIMIT = 200;

export function parseDashboardRange(value: string | null | undefined): DashboardRange {
  return value === 'yesterday' || value === '7d' || value === '30d' ? value : 'today';
}

/** Debut de journee du restaurant; sans fuseau connu, minuit de l'appareil (ancien comportement). */
function dayStart(timeZone: string | undefined, daysAgo: number): Date {
  if (timeZone) return getDayStartInZone(timeZone, daysAgo);
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Safely execute a Supabase query, returning null on failure instead of throwing. */
async function safeQuery<T>(
  queryFn: () => PromiseLike<{ data: T | null; error: unknown; count?: number | null }>,
  label: string,
): Promise<{ data: T | null; count: number | null }> {
  try {
    const res = await queryFn();
    if (res.error) {
      logger.warn(`[Dashboard] Query "${label}" failed`, { error: res.error });
      return { data: null, count: null };
    }
    return { data: res.data, count: (res.count as number) ?? null };
  } catch (err) {
    logger.warn(`[Dashboard] Query "${label}" threw`, { error: err });
    return { data: null, count: null };
  }
}

/**
 * Fetch dashboard stats: today's orders, revenue, active items, active venues,
 * recent orders with items, and low-stock ingredients.
 *
 * Each query is isolated so a single failure cannot block other charts from loading.
 */
export function useDashboardStats(
  tenantId: string,
  /**
   * `reports.view` effectif. Sans lui, le serveur masque deja le chiffre
   * d'affaires de la page; ce rafraichissement client le recalculait 30 s plus
   * tard (le chef voyait la recette du jour). Sans ce droit, les montants ne
   * sont ni demandes ni calcules: seuls les comptes de commandes restent.
   */
  canViewRevenue: boolean,
  initialData?: DashboardData,
  timeZone?: string,
  /**
   * Periode de la liste des commandes. Elle est lue EN BASE, dans le fuseau du
   * restaurant: le selecteur filtrait les 12 dernieres commandes deja chargees,
   * a minuit de l'appareil ("Hier: 0 commande" des la 13e commande du jour).
   * Audit d'equipe du 2026-11-27, dashboard N1.
   */
  range: DashboardRange = 'today',
) {
  return useQuery<DashboardData>({
    queryKey: ['dashboard-stats', tenantId, canViewRevenue, range],
    queryFn: async () => {
      const supabase = createClient();
      // Meme journee que la page serveur: celle du restaurant (audit R-02).
      const today = dayStart(timeZone, 0);
      const yesterday = dayStart(timeZone, 1);
      const rangeStart =
        range === 'yesterday'
          ? yesterday
          : range === '7d'
            ? dayStart(timeZone, 6)
            : range === '30d'
              ? dayStart(timeZone, 29)
              : today;
      const rangeEnd = range === 'yesterday' ? today : null;

      // -- Fire all queries in parallel with individual error isolation --
      const [ordersRes, itemsRes, venuesRes, recentRes, yesterdayRes] = await Promise.all([
        // Today's orders for stats
        safeQuery(
          () =>
            supabase
              .from('orders')
              // Colonnes d'argent lues seulement par qui a le droit de les voir.
              .select('id, status, payment_status, created_at')
              .eq('tenant_id', tenantId)
              .gte('created_at', today.toISOString()),
          'todayOrders',
        ),
        // Active items count
        safeQuery(
          () =>
            supabase
              .from('menu_items')
              .select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenantId)
              .eq('is_available', true),
          'activeItems',
        ),
        // Active venues count
        safeQuery(
          () =>
            supabase
              .from('venues')
              .select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenantId)
              .eq('is_active', true),
          'activeVenues',
        ),
        // Commandes de la periode choisie, avec leurs plats
        safeQuery(() => {
          const query = supabase
            .from('orders')
            .select(
              `id, order_number, table_number, status, total, tip_amount, created_at, service_type, payment_status,
               order_items(id, quantity, price_at_order, menu_items(name))`,
              { count: 'exact' },
            )
            .eq('tenant_id', tenantId)
            .gte('created_at', rangeStart.toISOString());
          return (rangeEnd ? query.lt('created_at', rangeEnd.toISOString()) : query)
            .order('created_at', { ascending: false })
            .limit(RECENT_ORDERS_LIMIT);
        }, 'recentOrders'),
        // Yesterday's orders for trend comparison
        safeQuery(
          () =>
            supabase
              .from('orders')
              .select('id, status, payment_status')
              .eq('tenant_id', tenantId)
              .gte('created_at', yesterday.toISOString())
              .lt('created_at', today.toISOString()),
          'yesterdayOrders',
        ),
      ]);

      // Money received (payments ledger, owner decision C-041 - see
      // src/lib/orders/revenue.ts). Not even requested without `reports.view`.
      type LedgerEntry = LedgerRow & { order_id?: string | null; created_at?: string };
      const recentPaymentsRes = !canViewRevenue
        ? { data: null, count: null }
        : await safeQuery<LedgerEntry[]>(
            () =>
              supabase
                .from('payments')
                .select('order_id, amount, status, created_at')
                .eq('tenant_id', tenantId)
                .gte('created_at', yesterday.toISOString()),
            'recentPayments',
          );
      const recentPayments = recentPaymentsRes.data || [];
      const paymentsBetween = (from: Date, to?: Date) =>
        recentPayments.filter((p) => {
          const at = p.created_at ? new Date(p.created_at) : null;
          return !!at && at >= from && (!to || at < to);
        });
      const todayPayments = paymentsBetween(today);
      const yesterdayPayments = paymentsBetween(yesterday, today);

      // -- Build stats from isolated results --
      const ordersData = (ordersRes.data || []) as unknown as Array<Record<string, unknown>>;
      const stats: DashboardStats = {
        ordersToday: ordersData.length,
        // Revenue = money received today (payments ledger, shared with the SSR
        // dashboard and the reporting RPCs via src/lib/orders/revenue.ts).
        // Sans `reports.view`, le registre n'est pas lu: on l'ecrit aussi ici
        // pour ne jamais dependre de ce detail de requete.
        revenueToday: canViewRevenue ? sumLedgerNet(todayPayments) : 0,
        avgTicketToday: canViewRevenue ? averageLedgerTicket(todayPayments) : 0,
        activeItems: itemsRes.count || 0,
        activeCards: venuesRes.count || 0,
      };

      const recentOrders: Order[] = ((recentRes.data || []) as Record<string, unknown>[]).map(
        (order) => ({
          id: order.id as string,
          tenant_id: tenantId,
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
              name: ((item.menu_items as Record<string, unknown>)?.name as string) || 'Unknown',
              quantity: item.quantity as number,
              price: item.price_at_order as number,
            }),
          ),
        }),
      );

      // -- Trend calculations --
      const yesterdayOrders = (yesterdayRes.data || []) as unknown as Array<
        Record<string, unknown>
      >;
      const yesterdayRevenue = sumLedgerNet(yesterdayPayments);
      const yesterdayCount = yesterdayOrders.length;

      if (yesterdayCount > 0) {
        stats.ordersTrend = Math.round(
          ((stats.ordersToday - yesterdayCount) / yesterdayCount) * 100,
        );
      }
      if (canViewRevenue && yesterdayRevenue > 0) {
        stats.revenueTrend = Math.round(
          ((stats.revenueToday - yesterdayRevenue) / yesterdayRevenue) * 100,
        );
      }
      const yesterdayTicket = averageLedgerTicket(yesterdayPayments);
      if (canViewRevenue && yesterdayTicket > 0) {
        stats.avgTicketTrend = Math.round(
          ((stats.avgTicketToday - yesterdayTicket) / yesterdayTicket) * 100,
        );
      }

      return {
        stats,
        recentOrders,
        recentOrdersTotal: recentRes.count ?? recentOrders.length,
      };
    },
    enabled: !!tenantId,
    // Le serveur ne precharge que la periode "Aujourd'hui".
    initialData: range === 'today' ? initialData : undefined,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
