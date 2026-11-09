import { describe, it, expect, vi } from 'vitest';

// La grace de fin d'essai (storefrontAccess) distingue un gel `trial_expired`
// des autres gels par `freeze_reason`. Si la colonne sort du select du cache
// tenant, la cause arrive `undefined`, et un restaurant en grace voit sa carte
// fermee le jour meme du gel par le cron, sans que rien ne casse ailleurs.

const selected = vi.hoisted(() => ({ columns: '' }));

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@supabase/supabase-js', () => {
  const builder: Record<string, unknown> = {};
  builder.select = (columns: string) => {
    selected.columns = columns;
    return builder;
  };
  builder.eq = () => builder;
  builder.is = () => builder;
  builder.maybeSingle = async () => ({ data: null, error: null });
  return { createClient: () => ({ from: () => builder }) };
});

describe('cache tenant: colonnes de la regle d acces de la vitrine', () => {
  it.each(['getCachedTenant', 'getTenant'] as const)(
    '%s lit freeze_reason et les colonnes du verrou',
    async (fn) => {
      const cache = await import('../cache');
      selected.columns = '';
      await cache[fn]('resto');
      const columns = selected.columns.split(',').map((c) => c.trim());
      for (const col of [
        'freeze_reason',
        'is_active',
        'suspended_at',
        'subscription_status',
        'trial_ends_at',
      ]) {
        expect(columns).toContain(col);
      }
    },
  );
});
