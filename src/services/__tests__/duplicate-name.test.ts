import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertNameAvailable, escapeIlike } from '../duplicate-name';
import { ServiceError } from '../errors';
import { formatUnitCost } from '@/lib/utils/currency';

function mockSupabase(result: {
  data: { id: string }[] | null;
  error: { message: string } | null;
}) {
  const calls: Array<[string, ...unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'ilike', 'is']) {
    builder[m] = vi.fn((...args: unknown[]) => {
      calls.push([m, ...args]);
      return builder;
    });
  }
  builder.limit = vi.fn(async () => result);
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as SupabaseClient, calls, from };
}

describe('assertNameAvailable', () => {
  const base = {
    table: 'menus' as const,
    tenantId: 'tenant-A',
    name: '  Carte du Soir ',
    message: 'Une carte porte déjà ce nom.',
  };

  it('refuse un doublon, filtre par tenant et compare sans casse ni espaces de bord', async () => {
    const { client, calls } = mockSupabase({ data: [{ id: 'x' }], error: null });
    await expect(assertNameAvailable(client, base)).rejects.toMatchObject({
      message: 'Une carte porte déjà ce nom.',
      code: 'VALIDATION',
    });
    expect(calls).toContainEqual(['eq', 'tenant_id', 'tenant-A']);
    expect(calls).toContainEqual(['ilike', 'name', 'Carte du Soir']);
  });

  it('accepte un nom libre', async () => {
    const { client } = mockSupabase({ data: [], error: null });
    await expect(assertNameAvailable(client, base)).resolves.toBeUndefined();
  });

  it('limite la comparaison a la categorie du plat et ignore les plats supprimes', async () => {
    const { client, calls } = mockSupabase({ data: [{ id: 'x' }], error: null });
    await expect(
      assertNameAvailable(client, {
        ...base,
        table: 'menu_items',
        scope: { column: 'category_id', value: 'cat-1' },
        excludeSoftDeleted: true,
      }),
    ).rejects.toBeInstanceOf(ServiceError);
    expect(calls).toContainEqual(['eq', 'category_id', 'cat-1']);
    expect(calls).toContainEqual(['is', 'deleted_at', null]);
  });

  it('ne bloque pas la creation si la lecture echoue', async () => {
    const { client } = mockSupabase({ data: null, error: { message: 'boom' } });
    await expect(assertNameAvailable(client, base)).resolves.toBeUndefined();
  });

  it('ignore un nom vide', async () => {
    const { client, from } = mockSupabase({ data: [{ id: 'x' }], error: null });
    await assertNameAvailable(client, { ...base, name: '   ' });
    expect(from).not.toHaveBeenCalled();
  });
});

describe('escapeIlike', () => {
  it('echappe les jokers pour comparer le texte tel quel', () => {
    expect(escapeIlike('100%_vrai\\')).toBe('100\\%\\_vrai\\\\');
  });
});

describe('formatUnitCost', () => {
  it('garde les centimes reels (250,5 ne devient pas 251)', () => {
    expect(formatUnitCost(250.5, 'XAF').replace(/\s/g, ' ')).toContain('250,5');
  });

  it('affiche un entier sans decimales en XAF', () => {
    expect(formatUnitCost(250, 'XAF')).not.toContain(',');
  });
});
