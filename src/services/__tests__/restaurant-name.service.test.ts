import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isRestaurantNameTaken } from '../restaurant-name.service';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

function client(result: { data: unknown; error: unknown }) {
  const ilike = vi.fn();
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'is', 'eq', 'not']) chain[m] = vi.fn(() => chain);
  chain.ilike = (...a: unknown[]) => {
    ilike(...a);
    return chain;
  };
  chain.limit = vi.fn(async () => result);
  return { client: { from: () => chain } as unknown as SupabaseClient, ilike };
}

describe('isRestaurantNameTaken (A-08)', () => {
  it('vrai quand un restaurant etabli porte deja ce nom', async () => {
    const { client: c } = client({ data: [{ id: 't-1' }], error: null });
    expect(await isRestaurantNameTaken(c, 'Chez Awa')).toBe(true);
  });

  it('faux quand le nom est libre', async () => {
    const { client: c } = client({ data: [], error: null });
    expect(await isRestaurantNameTaken(c, 'Chez Awa')).toBe(false);
  });

  it('compare le nom exact: espaces de bord retires, jokers ILIKE echappes', async () => {
    const { client: c, ilike } = client({ data: [], error: null });
    await isRestaurantNameTaken(c, '  100%_Resto\\ ');
    expect(ilike).toHaveBeenCalledWith('name', '100\\%\\_Resto\\\\');
  });

  it('laisse le declencheur en base decider quand la lecture echoue ou que le nom est vide', async () => {
    const failing = client({ data: null, error: { message: 'db down' } });
    expect(await isRestaurantNameTaken(failing.client, 'Chez Awa')).toBe(false);
    const empty = client({ data: [{ id: 'x' }], error: null });
    expect(await isRestaurantNameTaken(empty.client, '   ')).toBe(false);
  });
});
