import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * B-2 (contre-audit FINAL-LOTS-8-9) - la QUATRIEME surface.
 *
 * `GET /api/menu-search` est une route PUBLIQUE qui sert jusqu'a 150 articles
 * avec leurs prix, variantes et modificateurs. Elle ne lisait que `is_active`:
 * ni `suspended_at` (la colonne que ce lot vient d'appliquer partout ailleurs),
 * ni `deleted_at` sur le tenant, ni `subscription_status`. Les trois autres
 * surfaces (vitrine, prise de commande, tableau de bord) refusent ces trois
 * etats; celle-ci servait la carte complete d'un tenant gele, suspendu ou
 * supprime des lors que `is_active` valait `true` - etat qu'un simple
 * `unsuspendTenant` produit sur un tenant reste `frozen`.
 *
 * La condition est desormais la meme que celle de
 * `src/services/order/order-queries.ts` (validateTenant).
 */

vi.mock('@/lib/rate-limit', () => ({
  menuSearchLimiter: { check: vi.fn() },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET } from '../menu-search/route';
import { menuSearchLimiter } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';

type TenantRow = Record<string, unknown> | null;

/** Les filtres `.is(...)` appliques a la lecture du tenant, pour les asserter. */
interface Harness {
  tenantFilters: Array<[string, unknown]>;
  tenantColumns: string[];
}

function setupSupabase(tenant: TenantRow): Harness {
  const harness: Harness = { tenantFilters: [], tenantColumns: [] };

  const menuItems = [{ id: 'item-1', name: 'Poulet bicyclette', price: 4500 }];

  vi.mocked(createClient).mockResolvedValue({
    from: (table: string) => {
      if (table === 'tenants') {
        const chain = {
          select: (columns: string) => {
            harness.tenantColumns.push(columns);
            return chain;
          },
          eq: () => chain,
          is: (column: string, value: unknown) => {
            harness.tenantFilters.push([column, value]);
            return chain;
          },
          single: async () => ({
            data: tenant,
            error: tenant ? null : { message: 'not found' },
          }),
        };
        return chain;
      }
      if (table === 'menu_items') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          is: () => chain,
          order: () => chain,
          limit: async () => ({ data: menuItems, error: null }),
        };
        return chain;
      }
      throw new Error(`Table inattendue: ${table}`);
    },
    // Double reduit a `from`: la route n'utilise rien d'autre du client.
  } as unknown as SupabaseClient);

  return harness;
}

function mockHeaders(slug: string | null) {
  vi.mocked(headers).mockResolvedValue({
    get: (key: string) => (key === 'x-tenant-slug' ? slug : null),
  } as unknown as Awaited<ReturnType<typeof headers>>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(menuSearchLimiter.check).mockResolvedValue({
    success: true,
    limit: 30,
    remaining: 29,
    reset: Date.now() + 60_000,
  });
  mockHeaders('radisson');
});

function request(): Request {
  return new Request('http://localhost:3000/api/menu-search');
}

describe('GET /api/menu-search - etat du tenant', () => {
  it('sert la carte d un tenant sain', async () => {
    setupSupabase({
      id: 'tenant-1',
      is_active: true,
      suspended_at: null,
      subscription_status: 'active',
    });
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(1);
  });

  it('refuse un tenant suspendu par la plateforme, meme avec is_active = true', async () => {
    setupSupabase({
      id: 'tenant-1',
      is_active: true,
      suspended_at: '2026-11-01T10:00:00.000Z',
      subscription_status: 'active',
    });
    const response = await GET(request());
    expect(response.status).toBe(400);
  });

  it('refuse un tenant gele (frozen), meme avec is_active = true', async () => {
    // Exactement ce que `unsuspendTenant` produit: il repose `is_active = true`
    // sans regarder le statut d'abonnement.
    setupSupabase({
      id: 'tenant-1',
      is_active: true,
      suspended_at: null,
      subscription_status: 'frozen',
    });
    const response = await GET(request());
    expect(response.status).toBe(400);
  });

  it('refuse un statut d abonnement absent (fail-closed)', async () => {
    setupSupabase({
      id: 'tenant-1',
      is_active: true,
      suspended_at: null,
      subscription_status: null,
    });
    const response = await GET(request());
    expect(response.status).toBe(400);
  });

  it('filtre les tenants supprimes au niveau de la requete (deleted_at)', async () => {
    const harness = setupSupabase({
      id: 'tenant-1',
      is_active: true,
      suspended_at: null,
      subscription_status: 'trial',
    });
    await GET(request());
    expect(harness.tenantFilters).toEqual([['deleted_at', null]]);
    expect(harness.tenantColumns[0]).toContain('suspended_at');
    expect(harness.tenantColumns[0]).toContain('subscription_status');
  });

  it('refuse toujours un tenant inactif', async () => {
    setupSupabase({
      id: 'tenant-1',
      is_active: false,
      suspended_at: null,
      subscription_status: 'active',
    });
    const response = await GET(request());
    expect(response.status).toBe(400);
  });

  it('refuse quand aucun tenant n est identifie', async () => {
    mockHeaders(null);
    setupSupabase(null);
    const response = await GET(request());
    expect(response.status).toBe(400);
  });
});

describe('GET /api/menu-search - cle du compteur de debit', () => {
  /**
   * CE QUE CE TEST VERROUILLE. Les convives d un lieu partagent le Wi-Fi du
   * restaurant, donc une seule adresse: compter par adresse seule faisait qu un
   * service charge epuisait le compartiment, et le refus tombait sur le client
   * en train de finir sa commande. La cle porte donc le restaurant.
   */
  it('compose la cle avec le restaurant quand l en-tete vient du middleware', async () => {
    setupSupabase({
      id: 'tenant-1',
      is_active: true,
      suspended_at: null,
      subscription_status: 'active',
      trial_ends_at: null,
      frozen_reason: null,
    });

    await GET(request());

    const cle = vi.mocked(menuSearchLimiter.check).mock.calls[0][0];
    expect(cle.startsWith('radisson:')).toBe(true);
  });

  /**
   * LA PROPRIETE DE SECURITE. `readTenantSlug` rend aussi un INDICE fourni par
   * le CLIENT quand le middleware n a rien injecte. Le mettre dans la cle
   * laissait un attaquant se fabriquer autant de compartiments qu il voulait en
   * changeant d en-tete - donc echapper entierement a la limite. Avant ce
   * changement la cle etait l adresse SEULE, soit UN compartiment: utiliser
   * l indice etait donc une REGRESSION, pas un statu quo.
   */
  it('ignore un slug fourni par le client: un seul compartiment par adresse', async () => {
    setupSupabase({
      id: 'tenant-1',
      is_active: true,
      suspended_at: null,
      subscription_status: 'active',
      trial_ends_at: null,
      frozen_reason: null,
    });
    // Aucun en-tete de confiance: seulement l indice, choisi par l appelant.
    vi.mocked(headers).mockResolvedValue({
      get: (cle: string) => (cle === 'x-tenant-slug-hint' ? 'restaurant-invente' : null),
    } as unknown as Awaited<ReturnType<typeof headers>>);

    await GET(request());

    const cle = vi.mocked(menuSearchLimiter.check).mock.calls[0][0];
    expect(cle).not.toContain('restaurant-invente');
    expect(cle.startsWith('-:')).toBe(true);
  });
});
