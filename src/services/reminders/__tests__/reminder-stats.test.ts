import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadReminderStats } from '../reminder-stats';

const NOW = new Date('2026-11-16T12:00:00Z');

function fakeAdmin(rpcRows: unknown[], mutedCount: Record<string, number> = {}): SupabaseClient {
  return {
    rpc: async () => ({ data: rpcRows, error: null }),
    from() {
      let rule = '';
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (c: string, v: string) => {
          if (c === 'rule') rule = v;
          return chain;
        },
        then: (ok: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, count: mutedCount[rule] ?? 0, error: null }).then(ok),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

describe('loadReminderStats', () => {
  it('convertit les agregats de la base en taux, par type de regle', async () => {
    const admin = fakeAdmin(
      [
        {
          rule: 'order_ready_not_served',
          sent: 3,
          escalated: 1,
          restaurants: 2,
          resolved_within: 2,
          median_minutes: 4,
          notifications: 3,
          opened: 0,
        },
        {
          rule: 'weekly_coach',
          sent: 2,
          escalated: 0,
          restaurants: 2,
          resolved_within: 0,
          median_minutes: null,
          notifications: 2,
          opened: 1,
        },
      ],
      { weekly_coach: 1 },
    );
    const stats = await loadReminderStats(admin, NOW);
    const ready = stats.find((s) => s.rule === 'order_ready_not_served')!;
    expect(ready).toMatchObject({
      kind: 'service',
      sent: 3,
      escalated: 1,
      restaurants: 2,
      medianMinutesToResolve: 4,
      openedRate: null,
      muted: 0,
    });
    expect(ready.resolvedWithinRate).toBeCloseTo(2 / 3);
    const coach = stats.find((s) => s.rule === 'weekly_coach')!;
    expect(coach).toMatchObject({
      kind: 'scheduled',
      sent: 2,
      openedRate: 0.5,
      muted: 1,
      resolvedWithinRate: null,
    });
  });

  it('une regle sans aucun rappel reste du bon type, sans chiffre invente', async () => {
    const stats = await loadReminderStats(fakeAdmin([]), NOW);
    expect(stats.find((s) => s.rule === 'order_not_started')).toEqual({
      rule: 'order_not_started',
      kind: 'service',
      sent: 0,
      escalated: 0,
      restaurants: 0,
      resolvedWithinRate: null,
      medianMinutesToResolve: null,
      openedRate: null,
      muted: 0,
    });
  });
});
