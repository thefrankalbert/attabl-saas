import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAnnouncementService } from '../announcement.service';

function mockSupabase(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'lte', 'or', 'order']) {
    chain[m] = vi.fn((...args: unknown[]) => {
      calls.push([m, args]);
      return chain;
    });
  }
  chain.limit = vi.fn(async (...args: unknown[]) => {
    calls.push(['limit', args]);
    return result;
  });
  const supabase = { from: vi.fn(() => chain) } as unknown as SupabaseClient;
  return { supabase, calls };
}

describe('listVisibleAnnouncements', () => {
  const now = new Date('2026-11-16T09:00:00.000Z');

  it('filters by tenant, active flag, start date and a whole-day end date', async () => {
    const { supabase, calls } = mockSupabase({
      data: [{ id: 'a1', title: 'Fermeture lundi', description: null }],
      error: null,
    });
    const out = await createAnnouncementService(supabase).listVisibleAnnouncements('t1', now);

    expect(out).toEqual([{ id: 'a1', title: 'Fermeture lundi', description: null }]);
    expect(calls).toContainEqual(['eq', ['tenant_id', 't1']]);
    expect(calls).toContainEqual(['eq', ['is_active', true]]);
    expect(calls).toContainEqual(['lte', ['start_date', '2026-11-16T09:00:00.000Z']]);
    // End day stored at 00:00 UTC must still show during that day: cutoff = now - 24 h.
    expect(calls).toContainEqual(['or', ['end_date.is.null,end_date.gt.2026-11-15T09:00:00.000Z']]);
  });

  it('returns an empty list on a database error instead of throwing', async () => {
    const { supabase } = mockSupabase({ data: null, error: { message: 'boom' } });
    await expect(
      createAnnouncementService(supabase).listVisibleAnnouncements('t1', now),
    ).resolves.toEqual([]);
  });
});
