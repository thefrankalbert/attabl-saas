import type {
  ChartDataPoint,
  CommandCenterAlert,
  LocationStat,
  Tenant,
} from '@/types/command-center.types';
import { fromMinorUnits } from '@/lib/utils/money';

/**
 * Pure, deterministic reducers and helpers for the Command Center data layer.
 *
 * NONE of these functions read the clock (no Date.now / new Date() without an
 * argument). The caller (the hook) always supplies `now` so the same inputs
 * always produce the same outputs - which is what makes them unit-testable.
 */

/** Minimal shape of an order row pulled from the `orders` table. */
export interface DerivableOrder {
  id: string;
  order_number: string | null;
  /** orders.total in integer MINOR units; convert with toMajorAmount before use. */
  total: number | string | null;
  status: string | null;
  created_at: string;
  tenant_id: string;
  display_currency?: string | null;
}

/** Per-tenant aggregate for the current day, including a 24-bucket sparkline. */
export interface TenantToday {
  revenue: number;
  orders: number;
  /** One entry per hour of the day (index 0..23), value = revenue in that hour. */
  sparkline: number[];
}

/** Per-tenant aggregate for the previous day (no sparkline needed). */
export interface TenantYesterday {
  revenue: number;
  orders: number;
}

/** Translator signatures the alert mapper depends on (kept framework-free). */
export interface AlertTranslators {
  orderCancelled: (number: string) => string;
  siteOffline: () => string;
}

const HOURS_IN_DAY = 24;

/** Build initials for an avatar fallback from a display name. */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Coerce a possibly-string total into a finite number (0 on failure). */
export function toAmount(value: number | string | null): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * orders.total is stored in integer MINOR units. Convert one order's total to a
 * major-unit number using its own currency (audit H1 Phase 2). XAF/XOF are
 * zero-decimal so this is identity; EUR/USD divide by 100. (Cross-tenant sums of
 * these major values still mix currencies - a pre-existing platform limitation -
 * but each term is now its true value, not 100x for EUR/USD.)
 */
export function toMajorAmount(order: Pick<DerivableOrder, 'total' | 'display_currency'>): number {
  return fromMinorUnits(toAmount(order.total), order.display_currency);
}

/**
 * Bucket today's orders per tenant: revenue, order count, and an hourly
 * sparkline. Cancelled orders are skipped. Orders whose tenant_id is not in
 * `tenantIds` are ignored (defensive - the query already filters by tenant).
 */
export function bucketToday(
  orders: DerivableOrder[],
  tenantIds: string[],
): Map<string, TenantToday> {
  const byTenant = new Map<string, TenantToday>();
  for (const id of tenantIds) {
    byTenant.set(id, { revenue: 0, orders: 0, sparkline: new Array(HOURS_IN_DAY).fill(0) });
  }
  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    const bucket = byTenant.get(o.tenant_id);
    if (!bucket) continue;
    const amount = toMajorAmount(o);
    bucket.revenue += amount;
    bucket.orders += 1;
    const h = new Date(o.created_at).getHours();
    if (h >= 0 && h < HOURS_IN_DAY) {
      bucket.sparkline[h] = (bucket.sparkline[h] || 0) + amount;
    }
  }
  return byTenant;
}

/**
 * Bucket yesterday's orders per tenant (revenue + count only). Cancelled
 * orders are skipped.
 */
export function bucketYesterday(
  orders: DerivableOrder[],
  tenantIds: string[],
): Map<string, TenantYesterday> {
  const byTenant = new Map<string, TenantYesterday>();
  for (const id of tenantIds) {
    byTenant.set(id, { revenue: 0, orders: 0 });
  }
  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    const bucket = byTenant.get(o.tenant_id);
    if (!bucket) continue;
    bucket.revenue += toMajorAmount(o);
    bucket.orders += 1;
  }
  return byTenant;
}

/**
 * Slice a full 24-entry sparkline down to the current hour (inclusive) so the
 * chart never shows empty future hours. `currentHour` is 0..23.
 */
export function sliceSparkline(sparkline: number[], currentHour: number): number[] {
  const end = Math.max(0, Math.min(currentHour, HOURS_IN_DAY - 1)) + 1;
  return sparkline.slice(0, end);
}

/**
 * Build the per-establishment location list, then sort it for the right-column
 * view (active first, then by today's revenue descending).
 */
export function buildLocations(
  tenants: Tenant[],
  today: Map<string, TenantToday>,
  yesterday: Map<string, TenantYesterday>,
  logoBySlug: Map<string, string | null>,
  currentHour: number,
): LocationStat[] {
  const computed: LocationStat[] = tenants.map((t) => {
    const td = today.get(t.id) || { revenue: 0, orders: 0, sparkline: [] };
    const yd = yesterday.get(t.id) || { revenue: 0, orders: 0 };
    return {
      tenant_id: t.id,
      tenant_slug: t.slug,
      tenant_name: t.name,
      tenant_plan: t.subscription_plan || null,
      tenant_logo_url: logoBySlug.get(t.slug) || null,
      is_active: t.is_active,
      revenue_today: td.revenue,
      revenue_yesterday: yd.revenue,
      orders_today: td.orders,
      orders_yesterday: yd.orders,
      sparkline: sliceSparkline(td.sparkline, currentHour),
    };
  });
  return [...computed].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return b.revenue_today - a.revenue_today;
  });
}

/** Sum a numeric field across all locations. */
export function sumLocations(
  locations: LocationStat[],
  field: 'revenue_today' | 'revenue_yesterday' | 'orders_today' | 'orders_yesterday',
): number {
  return locations.reduce((s, l) => s + l[field], 0);
}

/**
 * Map cancelled orders + inactive sites into Command Center alerts.
 * - cancelled order  -> error severity, kind 'payment'
 * - inactive site    -> warn severity, kind 'offline'
 * Offline alerts are listed first. Each kind is capped at 4 entries.
 * `now` is used as the synthetic created_at for offline alerts.
 */
export function buildAlerts(
  orders: DerivableOrder[],
  tenants: Tenant[],
  tenantById: Map<string, Tenant>,
  t: AlertTranslators,
  now: Date,
): CommandCenterAlert[] {
  const cancelledAlerts: CommandCenterAlert[] = orders
    .filter((o) => o.status === 'cancelled')
    .slice(0, 4)
    .map((o) => {
      const tenant = tenantById.get(o.tenant_id);
      return {
        id: o.id,
        kind: 'payment' as const,
        label: t.orderCancelled(o.order_number || o.id.slice(0, 6)),
        tenant_name: tenant?.name || '',
        tenant_slug: tenant?.slug || '',
        severity: 'error' as const,
        created_at: o.created_at,
      };
    });

  const offlineAlerts: CommandCenterAlert[] = tenants
    .filter((tenant) => !tenant.is_active)
    .slice(0, 4)
    .map((tenant) => ({
      id: `offline-${tenant.id}`,
      kind: 'offline' as const,
      label: t.siteOffline(),
      tenant_name: tenant.name,
      tenant_slug: tenant.slug,
      severity: 'warn' as const,
      created_at: now.toISOString(),
    }));

  return [...offlineAlerts, ...cancelledAlerts];
}

/** Resolve the chart window (start date + bucket granularity) for a period. */
export function chartWindow(
  period: 'day' | 'week' | 'month',
  now: Date,
): { startDate: Date; groupBy: 'hour' | 'day' } {
  if (period === 'day') {
    return {
      startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      groupBy: 'hour',
    };
  }
  if (period === 'week') {
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);
    return { startDate, groupBy: 'day' };
  }
  return { startDate: new Date(now.getFullYear(), now.getMonth(), 1), groupBy: 'day' };
}

/**
 * Bucket chart orders into hourly (00h..current hour) or daily (start..now)
 * series. Input orders are assumed already filtered to the window and to
 * exclude cancelled rows (the query does that), but we stay defensive.
 */
export function bucketChart(
  orders: Array<Pick<DerivableOrder, 'total' | 'created_at' | 'display_currency'>>,
  startDate: Date,
  now: Date,
  groupBy: 'hour' | 'day',
): ChartDataPoint[] {
  const buckets = new Map<string, { revenue: number; orders: number }>();

  if (groupBy === 'hour') {
    for (let h = 0; h <= now.getHours(); h++) {
      buckets.set(`${String(h).padStart(2, '0')}h`, { revenue: 0, orders: 0 });
    }
    for (const o of orders) {
      const key = `${String(new Date(o.created_at).getHours()).padStart(2, '0')}h`;
      const b = buckets.get(key);
      if (b) {
        b.revenue += toMajorAmount(o);
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
    for (const o of orders) {
      const d = new Date(o.created_at);
      const key = `${d.getDate()}/${d.getMonth() + 1}`;
      const b = buckets.get(key);
      if (b) {
        b.revenue += toMajorAmount(o);
        b.orders += 1;
      }
    }
  }

  return Array.from(buckets.entries()).map(([label, v]) => ({
    label,
    revenue: v.revenue,
    orders: v.orders,
  }));
}
