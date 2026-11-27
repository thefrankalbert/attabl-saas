import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import { logger } from '@/lib/logger';
import type { DerivableOrder, DerivablePayment } from '@/app/admin/tenants/command-center.derive';

/**
 * Lectures du Command Center (vue multi-restaurants).
 *
 * Deux appelants, un seul code:
 *  - le super administrateur, par la route /api/admin/command-center, avec le
 *    client service_role APRES requireSuperAdmin(): la RLS de `orders` ne lui
 *    ouvre que les restaurants dont il est membre (1 sur 9 mesure en
 *    production), ses chiffres etaient donc faux (revue L017, A19);
 *  - le proprietaire de plusieurs restaurants, depuis le navigateur, avec son
 *    client RLS (il ne voit que ses restaurants, ce qui est voulu).
 *
 * Le chiffre d'affaires vient du registre `payments` (meme regle que
 * src/lib/orders/revenue.ts, revue L016 A18). Chaque requete est bornee aux
 * restaurants demandes (`tenant_id IN (...)`).
 */

/** Taille d'une page PostgREST (plafond par defaut de l'API). */
const PAGE_SIZE = 1000;
/**
 * Plafond de pages lues pour une fenetre. ponytail: 50 000 lignes suffisent
 * pour la plateforme actuelle; au-dela, passer a une agregation SQL.
 */
const MAX_PAGES = 50;

interface RecentOrderRow extends DerivableOrder {
  tenants: { name: string; slug: string } | null;
}

export interface CommandCenterOverview {
  todayOrders: DerivableOrder[];
  yesterdayOrders: DerivableOrder[];
  todayPayments: DerivablePayment[];
  yesterdayPayments: DerivablePayment[];
  recentOrders: RecentOrderRow[];
}

export interface CommandCenterChart {
  payments: DerivablePayment[];
  orders: Array<Pick<DerivableOrder, 'created_at'>>;
}

interface PaymentRow {
  tenant_id: string;
  amount: number | string | null;
  status: string | null;
  created_at: string;
  orders: { display_currency: string | null } | null;
}

type PageResult<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/** Lit toutes les pages d'une requete (la reponse PostgREST est plafonnee). */
async function readAllPages<T>(page: (from: number, to: number) => PageResult<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const from = i * PAGE_SIZE;
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new ServiceError('Erreur lors du chargement des chiffres', 'INTERNAL', error);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
  logger.warn('command-center: plafond de pages atteint, chiffres tronques', {
    maxRows: MAX_PAGES * PAGE_SIZE,
  });
  return rows;
}

function toPayment(row: PaymentRow): DerivablePayment {
  return {
    tenant_id: row.tenant_id,
    amount: row.amount,
    status: row.status,
    created_at: row.created_at,
    display_currency: row.orders?.display_currency ?? null,
  };
}

export function createCommandCenterService(supabase: SupabaseClient) {
  function payments(tenantIds: string[], fromIso: string, toIso?: string) {
    return readAllPages<PaymentRow>((from, to) => {
      let q = supabase
        .from('payments')
        .select('tenant_id, amount, status, created_at, orders(display_currency)')
        .in('tenant_id', tenantIds)
        .gte('created_at', fromIso);
      if (toIso) q = q.lt('created_at', toIso);
      return q
        .order('created_at', { ascending: true })
        .range(from, to) as unknown as PageResult<PaymentRow>;
    }).then((rows) => rows.map(toPayment));
  }

  function orders(tenantIds: string[], fromIso: string, toIso?: string) {
    return readAllPages<DerivableOrder>((from, to) => {
      let q = supabase
        .from('orders')
        .select('id, order_number, total, status, created_at, tenant_id, display_currency')
        .in('tenant_id', tenantIds)
        .gte('created_at', fromIso);
      if (toIso) q = q.lt('created_at', toIso);
      return q
        .order('created_at', { ascending: true })
        .range(from, to) as unknown as PageResult<DerivableOrder>;
    });
  }

  return {
    async loadOverview(
      tenantIds: string[],
      todayStartIso: string,
      yesterdayStartIso: string,
    ): Promise<CommandCenterOverview> {
      if (tenantIds.length === 0) {
        return {
          todayOrders: [],
          yesterdayOrders: [],
          todayPayments: [],
          yesterdayPayments: [],
          recentOrders: [],
        };
      }
      const [todayOrders, yesterdayOrders, todayPayments, yesterdayPayments, recent] =
        await Promise.all([
          orders(tenantIds, todayStartIso),
          orders(tenantIds, yesterdayStartIso, todayStartIso),
          payments(tenantIds, todayStartIso),
          payments(tenantIds, yesterdayStartIso, todayStartIso),
          supabase
            .from('orders')
            .select(
              'id, order_number, total, status, created_at, tenant_id, display_currency, tenants(name, slug)',
            )
            .in('tenant_id', tenantIds)
            .order('created_at', { ascending: false })
            .limit(8),
        ]);
      if (recent.error) {
        throw new ServiceError('Erreur lors du chargement des chiffres', 'INTERNAL', recent.error);
      }
      return {
        todayOrders,
        yesterdayOrders,
        todayPayments,
        yesterdayPayments,
        recentOrders: (recent.data ?? []) as unknown as RecentOrderRow[],
      };
    },

    async loadChart(tenantIds: string[], startIso: string): Promise<CommandCenterChart> {
      if (tenantIds.length === 0) return { payments: [], orders: [] };
      const [chartPayments, chartOrders] = await Promise.all([
        payments(tenantIds, startIso),
        orders(tenantIds, startIso),
      ]);
      return {
        payments: chartPayments,
        orders: chartOrders
          .filter((o) => o.status !== 'cancelled')
          .map((o) => ({ created_at: o.created_at })),
      };
    },
  };
}
