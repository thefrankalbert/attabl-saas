import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServicePush } from '@/services/push.service';

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const { sendGroup, recipientsAlreadySent, loadStockFacts, loadCoachFacts, coachWindow } =
  vi.hoisted(() => ({
    coachWindow: { current: null as { ymd: string } | null },
    sendGroup: vi.fn(),
    recipientsAlreadySent: vi.fn(),
    loadStockFacts: vi.fn(),
    loadCoachFacts: vi.fn(),
  }));

vi.mock('../reminder-delivery', () => ({
  createReminderDelivery: () => ({ sendGroup, recipientsAlreadySent }),
}));
vi.mock('../reminder-facts', () => ({ loadStockFacts, loadCoachFacts }));
// Fenetres a heure fixe forcees: le rappel "avant le service" est du, pas le bilan.
vi.mock('../rules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../rules')>();
  return {
    ...actual,
    preServiceWindow: () => ({ ymd: '2026-11-24', openAt: '11:00' }),
    weeklyCoachWindow: () => coachWindow.current,
  };
});

import { createReminderService } from '../reminder.service';

type Row = Record<string, unknown>;

/**
 * Fausse base: rend les lignes de chaque table, applique le filtre
 * `.in('tenant_id', lot)` et retient la taille de chaque liste passee a `.in`.
 */
function fakeDb(tables: Record<string, Row[]>) {
  const inSizes: { table: string; column: string; size: number }[] = [];
  const client = {
    from(table: string) {
      let rows = tables[table] ?? [];
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is', 'neq', 'not', 'lt', 'gte', 'order']) {
        chain[m] = () => chain;
      }
      chain.in = (column: string, values: unknown[]) => {
        inSizes.push({ table, column, size: values.length });
        if (column === 'tenant_id') rows = rows.filter((r) => values.includes(r.tenant_id));
        return chain;
      };
      chain.then = (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(ok);
      return chain;
    },
  } as unknown as SupabaseClient;
  return { client, inSizes };
}

const push = {} as ServicePush;
const NOW = new Date('2026-11-24T08:00:00Z');

function tenantRow(i: number): Row {
  return {
    id: `t${i}`,
    slug: `resto-${i}`,
    country: 'BF',
    opening_hours: null,
    default_locale: 'fr',
  };
}

describe('createReminderService.tick, rappels a heure fixe', () => {
  beforeEach(() => {
    sendGroup.mockReset().mockResolvedValue(true);
    recipientsAlreadySent.mockReset().mockResolvedValue(new Set());
    loadStockFacts
      .mockReset()
      .mockResolvedValue({ outOfStock: ['Riz'], low: [], hiddenDishes: [] });
    loadCoachFacts.mockReset();
    coachWindow.current = null;
  });

  it('B86: reprend destinataire par destinataire (celui dont la livraison a echoue est rappele)', async () => {
    const { client } = fakeDb({
      tenants: [tenantRow(1)],
      admin_users: [
        { id: 'owner1', user_id: 'u1', tenant_id: 't1', postes: ['owner'] },
        { id: 'mgr2', user_id: 'u2', tenant_id: 't1', postes: ['manager'] },
      ],
    });
    // Au passage precedent, seule la cloche du proprietaire est partie.
    recipientsAlreadySent.mockResolvedValue(new Set(['owner1']));

    await createReminderService(client, { push }).tick(NOW);

    const recipients = sendGroup.mock.calls.map(([g]) => g.recipient.id);
    expect(recipients).toEqual(['mgr2']);
    expect(sendGroup.mock.calls[0][0]).toMatchObject({
      rule: 'pre_service_stock',
      subjects: [{ key: '2026-11-24' }],
    });
  });

  it('B86 temoin: tous deja servis, rien ne repart et les faits ne sont pas relus', async () => {
    const { client } = fakeDb({
      tenants: [tenantRow(1)],
      admin_users: [{ id: 'owner1', user_id: 'u1', tenant_id: 't1', postes: ['owner'] }],
    });
    recipientsAlreadySent.mockResolvedValue(new Set(['owner1']));

    await createReminderService(client, { push }).tick(NOW);

    expect(sendGroup).not.toHaveBeenCalled();
    expect(loadStockFacts).not.toHaveBeenCalled();
  });

  it('B88: au-dela de 200 restaurants, les listes sont decoupees et le 300e est servi', async () => {
    const tenants = Array.from({ length: 450 }, (_, i) => tenantRow(i));
    const { client, inSizes } = fakeDb({
      tenants,
      admin_users: [{ id: 'owner300', user_id: 'u300', tenant_id: 't300', postes: ['owner'] }],
    });

    await createReminderService(client, { push }).tick(NOW);

    const tenantLists = inSizes.filter((c) => c.column === 'tenant_id');
    expect(tenantLists.length).toBeGreaterThan(0);
    expect(Math.max(...tenantLists.map((c) => c.size))).toBeLessThanOrEqual(200);
    expect(sendGroup.mock.calls.map(([g]) => g.recipient.id)).toEqual(['owner300']);
  });

  it('le coach hebdomadaire va au proprietaire ET au gerant, jamais au chef ni au serveur', async () => {
    coachWindow.current = { ymd: '2026-11-23' };
    loadCoachFacts.mockResolvedValue({
      weeks: 4,
      ordersInWindow: 100,
      peak: { day: 6, hour: 13, avgOrders: 25 },
      dropped: [],
    });
    const { client } = fakeDb({
      tenants: [tenantRow(1)],
      admin_users: [
        { id: 'owner1', user_id: 'u1', tenant_id: 't1', postes: ['owner'] },
        { id: 'mgr1', user_id: 'u2', tenant_id: 't1', postes: ['manager'] },
        { id: 'chef1', user_id: 'u3', tenant_id: 't1', postes: ['chef'] },
        { id: 'waiter1', user_id: 'u4', tenant_id: 't1', postes: ['waiter'] },
      ],
    });

    await createReminderService(client, { push }).tick(NOW);

    const coach = sendGroup.mock.calls
      .map(([g]) => g)
      .filter((g) => g.rule === 'weekly_coach')
      .map((g) => g.recipient.id)
      .sort();
    expect(coach).toEqual(['mgr1', 'owner1']);
  });

  it('temoin: sans fenetre du bilan, personne ne recoit le coach', async () => {
    coachWindow.current = null;
    const { client } = fakeDb({
      tenants: [tenantRow(1)],
      admin_users: [{ id: 'owner1', user_id: 'u1', tenant_id: 't1', postes: ['owner'] }],
    });

    await createReminderService(client, { push }).tick(NOW);

    expect(sendGroup.mock.calls.filter(([g]) => g.rule === 'weekly_coach')).toEqual([]);
  });
});
