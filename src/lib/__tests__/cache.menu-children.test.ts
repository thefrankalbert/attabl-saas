import { describe, it, expect, vi } from 'vitest';

// Audit B24 (CRITIQUE): la vitrine charge les sous-cartes par jointure
// `children:menus!parent_menu_id(...)` avec le client service_role (aucune
// RLS). Sans filtre de restaurant sur les ENFANTS, une carte d'un autre
// restaurant accrochee a une carte d'ici apparaissait comme onglet.

const queries = vi.hoisted(() => [] as Array<{ columns: string; eqs: Array<[string, unknown]> }>);

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const q = { columns: '', eqs: [] as Array<[string, unknown]> };
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

describe('getCachedMenuData: sous-cartes du meme restaurant seulement', () => {
  it('filtre les enfants par tenant_id', async () => {
    const { getCachedMenuData } = await import('../cache');
    await getCachedMenuData('tenant-B');
    const parents = queries.find((q) => q.columns.includes('children:menus!parent_menu_id'));
    expect(parents).toBeDefined();
    expect(parents!.eqs).toContainEqual(['tenant_id', 'tenant-B']);
    expect(parents!.eqs).toContainEqual(['children.tenant_id', 'tenant-B']);
  });
});
