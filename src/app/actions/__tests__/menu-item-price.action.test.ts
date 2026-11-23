import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Audit B42: `actionUpdateMenuItemPrice` ecrivait le prix sans validation. Une
 * Server Action est un POST appelable directement: -5000, 1500.75 ou une chaine
 * arrivaient en base. Meme absence de controle sur les drapeaux
 * `isAvailable` / `isFeatured` des deux actions voisines.
 */

const { updates } = vi.hoisted(() => ({ updates: [] as unknown[] }));

vi.mock('@/lib/billing/assert-tenant-serving', () => ({
  assertTenantServing: async () => undefined,
  TenantLockedError: class extends Error {},
}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (k: string) => k }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/auth/get-session', () => ({
  AuthError: class extends Error {
    status = 403;
  },
  getAuthenticatedUserForTenant: async () => ({ tenantId: 't' }),
}));
function chain() {
  const q: Record<string, unknown> = {};
  q.update = (body: unknown) => {
    updates.push(body);
    return q;
  };
  q.eq = () => q;
  q.is = () => q;
  q.select = () => q;
  q.then = (res: (v: unknown) => unknown) => res({ error: null, count: 1, data: [{ id: 'x' }] });
  return q;
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: () => chain() }) }));

import {
  actionUpdateMenuItemPrice,
  actionToggleMenuItemAvailable,
  actionToggleMenuItemFeatured,
} from '@/app/actions/menu-items';

const T = '22222222-2222-4222-a222-222222222222';
const X = '33333333-3333-4333-a333-333333333333';

beforeEach(() => {
  updates.length = 0;
});

describe('actionUpdateMenuItemPrice (B42)', () => {
  it.each([
    ['negatif', -5000],
    ['decimal (FCFA sans decimales)', 1500.75],
    ['au-dela de numeric(10,2)', 100_000_000],
    ['chaine', 'abc' as unknown as number],
  ])('refuse un prix %s sans rien ecrire', async (_l, price) => {
    const r = await actionUpdateMenuItemPrice(T, X, price);
    expect(r.error).toBeTruthy();
    expect(updates).toHaveLength(0);
  });

  it('temoin: un prix entier positif est ecrit', async () => {
    const r = await actionUpdateMenuItemPrice(T, X, 2500);
    expect(r).toEqual({ success: true });
    expect(updates).toEqual([{ price: 2500 }]);
  });
});

describe('drapeaux de plat (B42)', () => {
  it('refuse un isAvailable qui n est pas un booleen', async () => {
    const r = await actionToggleMenuItemAvailable(T, X, 'oui' as unknown as boolean);
    expect(r.error).toBeTruthy();
    expect(updates).toHaveLength(0);
  });

  it('refuse un isFeatured qui n est pas un booleen', async () => {
    const r = await actionToggleMenuItemFeatured(T, X, 1 as unknown as boolean);
    expect(r.error).toBeTruthy();
    expect(updates).toHaveLength(0);
  });

  it('temoin: un booleen passe', async () => {
    const r = await actionToggleMenuItemAvailable(T, X, false);
    expect(r).toEqual({ success: true });
  });
});
