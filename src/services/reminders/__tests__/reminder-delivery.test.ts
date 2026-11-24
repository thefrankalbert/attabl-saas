import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServicePush } from '@/services/push.service';

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { createReminderDelivery, type ReminderGroup } from '../reminder-delivery';

interface Call {
  table: string;
  op: string;
  payload?: unknown;
  filters: [string, string, unknown][];
}

let calls: Call[];
let recentRows: unknown[];
let claimedRows: { id: string; subject_key: string }[];
let notifError: unknown;
let deleteError: unknown;

/** Fausse base: enregistre chaque appel, rend des reponses scriptees. */
function fakeDb(): SupabaseClient {
  return {
    from(table: string) {
      const call: Call = { table, op: 'select', filters: [] };
      calls.push(call);
      const result = () => {
        if (table === 'reminders' && call.op === 'select') return { data: recentRows, error: null };
        if (table === 'reminders' && call.op === 'upsert')
          return { data: claimedRows, error: null };
        if (table === 'reminders' && call.op === 'delete')
          return { data: null, error: deleteError };
        if (table === 'notifications' && call.op === 'insert')
          return notifError
            ? { data: null, error: notifError }
            : { data: { id: 'notif-1' }, error: null };
        return { data: null, error: null };
      };
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (c: string, v: unknown) => (call.filters.push(['eq', c, v]), chain),
        gte: (c: string, v: unknown) => (call.filters.push(['gte', c, v]), chain),
        in: (c: string, v: unknown) => (call.filters.push(['in', c, v]), chain),
        limit: () => chain,
        upsert: (p: unknown) => ((call.op = 'upsert'), (call.payload = p), chain),
        insert: (p: unknown) => ((call.op = 'insert'), (call.payload = p), chain),
        update: (p: unknown) => ((call.op = 'update'), (call.payload = p), chain),
        delete: () => ((call.op = 'delete'), chain),
        single: async () => result(),
        then: (ok: (v: unknown) => unknown) => Promise.resolve(result()).then(ok),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

const push = { envoyerAuxAppareilsDuTenant: vi.fn() } as unknown as ServicePush & {
  envoyerAuxAppareilsDuTenant: ReturnType<typeof vi.fn>;
};
const NOW = new Date('2026-11-16T12:00:00Z');

const group = (over: Partial<ReminderGroup> = {}): ReminderGroup => ({
  tenant: { id: 'tenant-a', slug: 'resto' },
  recipient: { id: 'waiter1', userId: 'u-w1', tenantId: 'tenant-a', role: 'waiter' },
  rule: 'order_ready_not_served',
  level: 1,
  subjects: [
    { key: 'o1@t', label: 'Table 4' },
    { key: 'o2@t', label: 'Table 8' },
  ],
  message: (labels) => ({
    title: `${labels.length} pretes`,
    body: labels.join(', '),
    url: '/service',
    urgent: true,
  }),
  ...over,
});

describe('createReminderDelivery.sendGroup', () => {
  beforeEach(() => {
    calls = [];
    recentRows = [];
    claimedRows = [
      { id: 'r1', subject_key: 'o1@t' },
      { id: 'r2', subject_key: 'o2@t' },
    ];
    push.envoyerAuxAppareilsDuTenant.mockReset();
    notifError = null;
    deleteError = null;
  });

  it('envoie un seul message groupe: cloche + push a cette personne seulement', async () => {
    const ok = await createReminderDelivery(fakeDb(), push).sendGroup(group(), NOW);

    expect(ok).toBe(true);
    const notif = calls.find((c) => c.table === 'notifications' && c.op === 'insert');
    expect(notif?.payload).toMatchObject({
      tenant_id: 'tenant-a',
      user_id: 'u-w1',
      type: 'reminder:order_ready_not_served',
      title: '2 pretes',
      body: 'Table 4, Table 8',
      link: '/service',
    });
    expect(push.envoyerAuxAppareilsDuTenant).toHaveBeenCalledTimes(1);
    const [tenantId, charge, dest] = push.envoyerAuxAppareilsDuTenant.mock.calls[0];
    expect(tenantId).toBe('tenant-a');
    expect(dest).toEqual({ membres: ['waiter1'] });
    expect(charge).toMatchObject({
      alerte: true,
      slug: 'resto',
      tag: 'rappel-order_ready_not_served-waiter1',
    });
  });

  it('deja prevenu de cette regle il y a moins de 2 min: on attend pour grouper', async () => {
    recentRows = [{ id: 'recent' }];
    const ok = await createReminderDelivery(fakeDb(), push).sendGroup(group(), NOW);

    expect(ok).toBe(false);
    expect(calls.some((c) => c.op === 'upsert')).toBe(false);
    expect(push.envoyerAuxAppareilsDuTenant).not.toHaveBeenCalled();
  });

  it('sujets deja envoyes (cle unique): rien ne repart', async () => {
    claimedRows = [];
    const ok = await createReminderDelivery(fakeDb(), push).sendGroup(group(), NOW);

    expect(ok).toBe(false);
    expect(push.envoyerAuxAppareilsDuTenant).not.toHaveBeenCalled();
  });

  it('seuls les sujets reserves a l instant figurent dans le message', async () => {
    claimedRows = [{ id: 'r2', subject_key: 'o2@t' }];
    await createReminderDelivery(fakeDb(), push).sendGroup(group(), NOW);

    const notif = calls.find((c) => c.table === 'notifications' && c.op === 'insert');
    expect(notif?.payload).toMatchObject({ title: '1 pretes', body: 'Table 8' });
  });

  it('la reservation porte le restaurant, la regle, le niveau et la personne', async () => {
    await createReminderDelivery(fakeDb(), push).sendGroup(group({ level: 2 }), NOW);
    const upsert = calls.find((c) => c.op === 'upsert');
    expect(upsert?.payload).toEqual([
      {
        tenant_id: 'tenant-a',
        rule: 'order_ready_not_served',
        subject_key: 'o1@t',
        recipient_id: 'waiter1',
        level: 2,
      },
      {
        tenant_id: 'tenant-a',
        rule: 'order_ready_not_served',
        subject_key: 'o2@t',
        recipient_id: 'waiter1',
        level: 2,
      },
    ]);
  });

  it('B86: recipientsAlreadySent rend les destinataires deja servis, filtre par restaurant, regle et sujet', async () => {
    recentRows = [{ recipient_id: 'owner1' }];
    const done = await createReminderDelivery(fakeDb(), push).recipientsAlreadySent(
      'tenant-a',
      'weekly_coach',
      '2026-11-16',
    );
    expect([...done]).toEqual(['owner1']);
    expect(calls[0].filters).toEqual([
      ['eq', 'tenant_id', 'tenant-a'],
      ['eq', 'rule', 'weekly_coach'],
      ['eq', 'subject_key', '2026-11-16'],
    ]);
  });

  it('le delai de regroupement est par niveau: une escalade n attend pas derriere un niveau 1', async () => {
    await createReminderDelivery(fakeDb(), push).sendGroup(group({ level: 2 }), NOW);
    const gate = calls.find((c) => c.table === 'reminders' && c.op === 'select');
    expect(gate?.filters).toContainEqual(['eq', 'level', 2]);
  });

  it('cloche en echec: la reservation est liberee pour reessayer, aucun push', async () => {
    notifError = { message: 'boom' };
    const ok = await createReminderDelivery(fakeDb(), push).sendGroup(group(), NOW);

    expect(ok).toBe(false);
    const released = calls.find((c) => c.table === 'reminders' && c.op === 'delete');
    expect(released?.filters).toEqual([['in', 'id', ['r1', 'r2']]]);
    expect(push.envoyerAuxAppareilsDuTenant).not.toHaveBeenCalled();
  });

  it('B86: une liberation de reservation ratee est journalisee en erreur', async () => {
    const { logger } = await import('@/lib/logger');
    vi.mocked(logger.error).mockClear();
    notifError = { message: 'boom' };
    deleteError = { code: '57014' };
    const ok = await createReminderDelivery(fakeDb(), push).sendGroup(group(), NOW);

    expect(ok).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('claim release failed'),
      { code: '57014' },
      expect.objectContaining({ tenantId: 'tenant-a' }),
    );
  });
});
