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
  // Regroupement IPv6 /64: l'identite suffit ici, son comportement est teste
  // dans src/lib/__tests__/rate-limit.test.ts.
  grouperAdresse: (ip: string) => ip,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

// Le client service_role declare `server-only`: sans ce mock, l'import echoue.
vi.mock('server-only', () => ({}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
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
import { createAdminClient } from '@/lib/supabase/admin';
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

  // Le tenant n'est lisible QUE par le client service_role: comme en prod depuis
  // 20261109002847, le client anon recoit 42501 sur les colonnes de verrou.
  const anonTenantsDenied = () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      single: async () => ({
        data: null,
        error: { code: '42501', message: 'permission denied for table tenants' },
      }),
    };
    return chain;
  };

  vi.mocked(createAdminClient).mockReturnValue({
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
      throw new Error(`Table inattendue en service_role: ${table}`);
    },
  } as unknown as ReturnType<typeof createAdminClient>);

  vi.mocked(createClient).mockResolvedValue({
    from: (table: string) => {
      if (table === 'tenants') return anonTenantsDenied();
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

/**
 * Fin d'essai (decision produit 2026-11-09): pendant 7 jours apres
 * `trial_ends_at`, la vitrine montre la carte en lecture seule. Sa recherche
 * doit suivre la MEME regle (`storefrontAccess`): avec l'ancienne
 * (`tenantLockReason`), la carte etait a l'ecran mais la recherche repondait
 * 400 et n'affichait rien.
 */
describe('GET /api/menu-search - lecture seule apres la fin de l essai', () => {
  const HOUR_MS = 60 * 60 * 1000;
  const ilYa = (heures: number) => new Date(Date.now() - heures * HOUR_MS).toISOString();

  it('sert la carte d un essai expire sans abonnement, pas encore gele', async () => {
    setupSupabase({
      id: 'tenant-1',
      is_active: true,
      suspended_at: null,
      subscription_status: 'trial',
      trial_ends_at: ilYa(2),
      stripe_subscription_id: null,
    });
    const response = await GET(request());
    expect(response.status).toBe(200);
  });

  it('sert la carte d un restaurant gele par le cron de fin d essai, dans les 7 jours', async () => {
    const harness = setupSupabase({
      id: 'tenant-1',
      is_active: false,
      suspended_at: null,
      subscription_status: 'frozen',
      freeze_reason: 'trial_expired',
      trial_ends_at: ilYa(48),
      stripe_subscription_id: null,
    });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(harness.tenantColumns[0]).toContain('freeze_reason');
  });

  it('refuse apres les 7 jours de lecture seule', async () => {
    setupSupabase({
      id: 'tenant-1',
      is_active: false,
      suspended_at: null,
      subscription_status: 'frozen',
      freeze_reason: 'trial_expired',
      trial_ends_at: ilYa(8 * 24),
      stripe_subscription_id: null,
    });
    const response = await GET(request());
    expect(response.status).toBe(400);
  });

  it('refuse un gel pour une autre cause que la fin d essai, meme dans les 7 jours', async () => {
    setupSupabase({
      id: 'tenant-1',
      is_active: false,
      suspended_at: null,
      subscription_status: 'frozen',
      freeze_reason: 'dispute',
      trial_ends_at: ilYa(2),
      stripe_subscription_id: null,
    });
    const response = await GET(request());
    expect(response.status).toBe(400);
  });

  it('refuse un essai expire suspendu par la plateforme: aucune grace', async () => {
    setupSupabase({
      id: 'tenant-1',
      is_active: true,
      suspended_at: ilYa(1),
      subscription_status: 'trial',
      trial_ends_at: ilYa(2),
      stripe_subscription_id: null,
    });
    const response = await GET(request());
    expect(response.status).toBe(400);
  });
});

describe('GET /api/menu-search - cle du compteur de debit', () => {
  function tenantSain() {
    setupSupabase({
      id: 'tenant-1',
      is_active: true,
      suspended_at: null,
      subscription_status: 'active',
      trial_ends_at: null,
      frozen_reason: null,
    });
  }

  /**
   * CE QUE CE TEST VERROUILLE, et deux versions fausses l ont precede.
   *
   * Le defaut d origine: 60 par minute et par adresse. Les convives d un lieu
   * sont TOUS derriere le Wi-Fi du restaurant, donc derriere une seule
   * adresse: un service charge epuisait le compartiment, et le refus tombait
   * sur le client en train de finir sa commande.
   *
   * Ma premiere correction composait la cle avec le slug du restaurant. Deux
   * revues ont montre qu elle etait contournable, et la seconde avait raison
   * sur le fond: `src/proxy.ts` injecte `x-tenant-slug` depuis le SOUS-DOMAINE
   * sans verifier que le restaurant existe, et le domaine accepte un
   * sous-domaine joker. Changer de sous-domaine donnait donc un compartiment
   * neuf a volonte - la limite ne valait plus rien.
   *
   * La cle ne doit donc porter QUE l adresse, qui est la seule valeur que
   * l appelant ne choisit pas (la plateforme reecrit l en-tete). Le benefice
   * pour les convives vient du CHIFFRE, pas de la composition.
   */
  it('ne compte que sur l adresse, jamais sur une valeur choisie par l appelant', async () => {
    tenantSain();

    await GET(request());

    expect(vi.mocked(menuSearchLimiter.check).mock.calls[0][0]).toBe('127.0.0.1');
  });

  it('un slug fourni par le client ne change pas le compartiment', async () => {
    tenantSain();
    vi.mocked(headers).mockResolvedValue({
      get: (cle: string) =>
        cle === 'x-tenant-slug-hint'
          ? 'restaurant-invente'
          : cle === 'x-tenant-slug'
            ? 'radisson'
            : null,
    } as unknown as Awaited<ReturnType<typeof headers>>);

    await GET(request());

    const cle = vi.mocked(menuSearchLimiter.check).mock.calls[0][0];
    expect(cle).not.toContain('restaurant-invente');
    expect(cle).not.toContain('radisson');
  });
});
