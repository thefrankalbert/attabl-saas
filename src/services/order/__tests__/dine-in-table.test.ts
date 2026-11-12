import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkDineInTable } from '../dine-in-table';

function mockSupabase(row: unknown) {
  const calls: Array<[string, unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) {
    chain[m] = vi.fn((...args: unknown[]) => {
      calls.push([m, args]);
      return chain;
    });
  }
  chain.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  const from = vi.fn(() => chain);
  return { supabase: { from } as unknown as SupabaseClient, calls, from };
}

describe('checkDineInTable (C-009 / C-061)', () => {
  it('needs no table for takeaway, delivery and room service', async () => {
    const { supabase, from } = mockSupabase(null);
    for (const mode of ['takeaway', 'delivery', 'room_service']) {
      expect(await checkDineInTable(supabase, 't1', mode, undefined)).toBeNull();
    }
    expect(from).not.toHaveBeenCalled();
  });

  it('still refuses an invented table on a takeaway order', async () => {
    const { supabase } = mockSupabase(null);
    expect(await checkDineInTable(supabase, 't1', 'takeaway', 'TAB-99')).toBe('UNKNOWN_TABLE');
  });

  it('requires a table to eat in', async () => {
    const { supabase } = mockSupabase(null);
    expect(await checkDineInTable(supabase, 't1', 'dine_in', undefined)).toBe('TABLE_REQUIRED');
    expect(await checkDineInTable(supabase, 't1', 'dine_in', '  ')).toBe('TABLE_REQUIRED');
  });

  it('refuses a table that is not an active table of this restaurant', async () => {
    const { supabase, calls } = mockSupabase(null);
    expect(await checkDineInTable(supabase, 't1', 'dine_in', 'TAB-99')).toBe('UNKNOWN_TABLE');
    expect(calls).toContainEqual(['eq', ['tenant_id', 't1']]);
    expect(calls).toContainEqual(['eq', ['table_number', 'TAB-99']]);
    expect(calls).toContainEqual(['eq', ['is_active', true]]);
  });

  it('accepts an existing table', async () => {
    const { supabase } = mockSupabase({ id: 'x' });
    expect(await checkDineInTable(supabase, 't1', 'dine_in', 'TER-1')).toBeNull();
  });
});
