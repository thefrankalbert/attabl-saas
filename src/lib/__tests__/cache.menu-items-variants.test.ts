import { describe, it, expect, vi } from 'vitest';

// Audit d'equipe du 2026-11-27 (convive C5): la page Menu ne chargeait ni les
// tailles ni les options des plats. Le "+" de la carte prenait alors un plat a
// tailles pour un plat simple et l'ajoutait au prix de base.

const queries = vi.hoisted(
  () => [] as Array<{ table: string; columns: string; eqs: Array<[string, unknown]> }>,
);

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const q = { table, columns: '', eqs: [] as Array<[string, unknown]> };
      queries.push(q);
      const builder: Record<string, unknown> = {};
      builder.select = (columns: string) => {
        q.columns = columns;
        return builder;
      };
      builder.eq = (col: string, val: unknown) => {
        q.eqs.push([col, val]);
        return builder;
      };
      builder.is = () => builder;
      builder.order = () => builder;
      builder.then = (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(ok);
      return builder;
    },
  }),
}));

describe('getCachedMenuData: plats avec tailles et options', () => {
  it('charge item_options et item_price_variants avec les plats', async () => {
    const { getCachedMenuData } = await import('../cache');
    await getCachedMenuData('tenant-A');
    const items = queries.find((q) => q.table === 'menu_items');
    expect(items).toBeDefined();
    expect(items!.columns).toContain('options:item_options(');
    expect(items!.columns).toContain('price_variants:item_price_variants(');
    expect(items!.columns).toContain('modifiers:item_modifiers(');
  });

  it('borne les jointures au restaurant (client service_role, aucune RLS)', async () => {
    const { getCachedMenuData } = await import('../cache');
    await getCachedMenuData('tenant-B');
    const items = queries.filter((q) => q.table === 'menu_items').at(-1);
    expect(items!.eqs).toContainEqual(['options.tenant_id', 'tenant-B']);
    expect(items!.eqs).toContainEqual(['price_variants.tenant_id', 'tenant-B']);
    expect(items!.eqs).toContainEqual(['modifiers.tenant_id', 'tenant-B']);
  });
});
