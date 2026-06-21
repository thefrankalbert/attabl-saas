import { describe, it, expect } from 'vitest';
import {
  bucketChart,
  bucketToday,
  bucketYesterday,
  buildAlerts,
  buildLocations,
  chartWindow,
  initialsFor,
  sliceSparkline,
  sumLocations,
  type DerivableOrder,
} from '../command-center.derive';
import type { Tenant } from '@/types/command-center.types';

// Deterministic clock anchor used across tests: 2026-06-15 14:00 local.
const NOW = new Date(2026, 5, 15, 14, 0, 0, 0);

function tenant(id: string, overrides: Partial<Tenant> = {}): Tenant {
  return {
    id,
    slug: `slug-${id}`,
    name: `Tenant ${id}`,
    subscription_status: 'active',
    subscription_plan: 'pro',
    is_active: true,
    ...overrides,
  };
}

function order(overrides: Partial<DerivableOrder> = {}): DerivableOrder {
  return {
    id: `o-${Math.random().toString(36).slice(2)}`,
    order_number: '0001',
    total: 10,
    status: 'delivered',
    created_at: new Date(2026, 5, 15, 9, 30, 0, 0).toISOString(),
    tenant_id: 'a',
    ...overrides,
  };
}

const translators = {
  orderCancelled: (n: string) => `cancelled-${n}`,
  siteOffline: () => 'offline',
};

describe('bucketToday', () => {
  it('groups orders into the right hour bucket and sums revenue + count', () => {
    const orders: DerivableOrder[] = [
      order({ tenant_id: 'a', total: 10, created_at: new Date(2026, 5, 15, 9, 5).toISOString() }),
      order({ tenant_id: 'a', total: 5, created_at: new Date(2026, 5, 15, 9, 50).toISOString() }),
      order({ tenant_id: 'a', total: 20, created_at: new Date(2026, 5, 15, 13, 0).toISOString() }),
    ];
    const result = bucketToday(orders, ['a']);
    const a = result.get('a')!;
    expect(a.revenue).toBe(35);
    expect(a.orders).toBe(3);
    expect(a.sparkline[9]).toBe(15); // both 9h orders summed
    expect(a.sparkline[13]).toBe(20);
    expect(a.sparkline[8]).toBe(0);
  });

  it('skips cancelled orders', () => {
    const orders: DerivableOrder[] = [
      order({ tenant_id: 'a', total: 10 }),
      order({ tenant_id: 'a', total: 99, status: 'cancelled' }),
    ];
    const a = bucketToday(orders, ['a']).get('a')!;
    expect(a.revenue).toBe(10);
    expect(a.orders).toBe(1);
  });

  it('ignores orders for unknown tenants', () => {
    const orders: DerivableOrder[] = [order({ tenant_id: 'ghost', total: 50 })];
    const result = bucketToday(orders, ['a']);
    expect(result.get('a')!.revenue).toBe(0);
    expect(result.has('ghost')).toBe(false);
  });

  it('coerces string totals to numbers', () => {
    const orders: DerivableOrder[] = [order({ tenant_id: 'a', total: '12.5' })];
    expect(bucketToday(orders, ['a']).get('a')!.revenue).toBe(12.5);
  });
});

describe('bucketYesterday', () => {
  it('splits yesterday aggregates per tenant and skips cancelled', () => {
    const orders: DerivableOrder[] = [
      order({ tenant_id: 'a', total: 30 }),
      order({ tenant_id: 'b', total: 7 }),
      order({ tenant_id: 'b', total: 100, status: 'cancelled' }),
    ];
    const result = bucketYesterday(orders, ['a', 'b']);
    expect(result.get('a')).toEqual({ revenue: 30, orders: 1 });
    expect(result.get('b')).toEqual({ revenue: 7, orders: 1 });
  });
});

describe('today vs yesterday split (via buildLocations)', () => {
  it('keeps today and yesterday revenue separate', () => {
    const tenants = [tenant('a')];
    const today = bucketToday([order({ tenant_id: 'a', total: 40 })], ['a']);
    const yesterday = bucketYesterday([order({ tenant_id: 'a', total: 25 })], ['a']);
    const locations = buildLocations(tenants, today, yesterday, new Map(), NOW.getHours());
    expect(locations[0].revenue_today).toBe(40);
    expect(locations[0].revenue_yesterday).toBe(25);
  });

  it('sorts active first then by revenue_today desc', () => {
    const tenants = [
      tenant('a', { is_active: false }),
      tenant('b', { is_active: true }),
      tenant('c', { is_active: true }),
    ];
    const today = bucketToday(
      [order({ tenant_id: 'b', total: 5 }), order({ tenant_id: 'c', total: 50 })],
      ['a', 'b', 'c'],
    );
    const yesterday = bucketYesterday([], ['a', 'b', 'c']);
    const locations = buildLocations(tenants, today, yesterday, new Map(), NOW.getHours());
    expect(locations.map((l) => l.tenant_id)).toEqual(['c', 'b', 'a']);
  });
});

describe('sliceSparkline', () => {
  it('slices to the current hour inclusive', () => {
    const full = Array.from({ length: 24 }, (_, i) => i);
    expect(sliceSparkline(full, 14)).toHaveLength(15);
    expect(sliceSparkline(full, 0)).toEqual([0]);
  });

  it('clamps out-of-range hours', () => {
    const full = new Array(24).fill(1);
    expect(sliceSparkline(full, 99)).toHaveLength(24);
    expect(sliceSparkline(full, -5)).toHaveLength(1);
  });
});

describe('buildAlerts', () => {
  it('maps a cancelled order to an error alert', () => {
    const tenants = [tenant('a')];
    const byId = new Map(tenants.map((t) => [t.id, t]));
    const orders = [order({ id: 'x', tenant_id: 'a', order_number: '42', status: 'cancelled' })];
    const alerts = buildAlerts(orders, tenants, byId, translators, NOW);
    const cancelled = alerts.find((al) => al.kind === 'payment');
    expect(cancelled).toBeDefined();
    expect(cancelled!.severity).toBe('error');
    expect(cancelled!.label).toBe('cancelled-42');
    expect(cancelled!.tenant_name).toBe('Tenant a');
  });

  it('maps an inactive site to a warn alert and lists offline first', () => {
    const tenants = [tenant('a', { is_active: false })];
    const byId = new Map(tenants.map((t) => [t.id, t]));
    const orders = [order({ tenant_id: 'a', status: 'cancelled' })];
    const alerts = buildAlerts(orders, tenants, byId, translators, NOW);
    expect(alerts[0].kind).toBe('offline');
    expect(alerts[0].severity).toBe('warn');
    expect(alerts[0].label).toBe('offline');
    expect(alerts[0].created_at).toBe(NOW.toISOString());
  });

  it('produces no alerts when everything is healthy', () => {
    const tenants = [tenant('a', { is_active: true })];
    const byId = new Map(tenants.map((t) => [t.id, t]));
    const alerts = buildAlerts(
      [order({ tenant_id: 'a', status: 'delivered' })],
      tenants,
      byId,
      translators,
      NOW,
    );
    expect(alerts).toHaveLength(0);
  });

  it('caps each alert kind at 4 entries', () => {
    const tenants = Array.from({ length: 6 }, (_, i) => tenant(`t${i}`, { is_active: false }));
    const byId = new Map(tenants.map((t) => [t.id, t]));
    const orders = Array.from({ length: 6 }, (_, i) =>
      order({ id: `c${i}`, tenant_id: 't0', status: 'cancelled' }),
    );
    const alerts = buildAlerts(orders, tenants, byId, translators, NOW);
    expect(alerts.filter((a) => a.kind === 'offline')).toHaveLength(4);
    expect(alerts.filter((a) => a.kind === 'payment')).toHaveLength(4);
  });
});

describe('chartWindow', () => {
  it('uses hourly buckets starting at midnight for the day period', () => {
    const { startDate, groupBy } = chartWindow('day', NOW);
    expect(groupBy).toBe('hour');
    expect(startDate.getHours()).toBe(0);
    expect(startDate.getDate()).toBe(15);
  });

  it('uses daily buckets over the last 7 days for the week period', () => {
    const { startDate, groupBy } = chartWindow('week', NOW);
    expect(groupBy).toBe('day');
    expect(startDate.getDate()).toBe(9); // 15 - 6
  });

  it('uses daily buckets from the 1st for the month period', () => {
    const { startDate, groupBy } = chartWindow('month', NOW);
    expect(groupBy).toBe('day');
    expect(startDate.getDate()).toBe(1);
  });
});

describe('bucketChart', () => {
  it('fills hourly buckets up to the current hour', () => {
    const { startDate } = chartWindow('day', NOW);
    const data = bucketChart(
      [
        { total: 10, created_at: new Date(2026, 5, 15, 9, 0).toISOString() },
        { total: 5, created_at: new Date(2026, 5, 15, 9, 30).toISOString() },
      ],
      startDate,
      NOW,
      'hour',
    );
    expect(data).toHaveLength(15); // 00h..14h inclusive
    expect(data.find((d) => d.label === '09h')).toEqual({ label: '09h', revenue: 15, orders: 2 });
  });

  it('fills daily buckets from startDate to now inclusive', () => {
    const { startDate } = chartWindow('week', NOW);
    const data = bucketChart(
      [
        { total: 20, created_at: new Date(2026, 5, 12, 10, 0).toISOString() },
        { total: 5, created_at: new Date(2026, 5, 12, 18, 0).toISOString() },
        { total: 8, created_at: new Date(2026, 5, 15, 9, 0).toISOString() },
      ],
      startDate,
      NOW,
      'day',
    );
    expect(data).toHaveLength(7); // 9/6..15/6 inclusive
    expect(data.find((d) => d.label === '12/6')).toEqual({ label: '12/6', revenue: 25, orders: 2 });
    expect(data.find((d) => d.label === '15/6')).toEqual({ label: '15/6', revenue: 8, orders: 1 });
  });
});

describe('sumLocations', () => {
  it('sums a numeric field across locations', () => {
    const tenants = [tenant('a'), tenant('b')];
    const today = bucketToday(
      [order({ tenant_id: 'a', total: 10 }), order({ tenant_id: 'b', total: 30 })],
      ['a', 'b'],
    );
    const yesterday = bucketYesterday([], ['a', 'b']);
    const locations = buildLocations(tenants, today, yesterday, new Map(), NOW.getHours());
    expect(sumLocations(locations, 'revenue_today')).toBe(40);
    expect(sumLocations(locations, 'orders_today')).toBe(2);
  });
});

describe('initialsFor', () => {
  it('handles empty, single, and multi-word names', () => {
    expect(initialsFor('')).toBe('??');
    expect(initialsFor('Radisson')).toBe('RA');
    expect(initialsFor('Le Jardin')).toBe('LJ');
  });
});
