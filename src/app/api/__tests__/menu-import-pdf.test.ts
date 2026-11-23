import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Import PDF, etape "import" avec la liste JSON renvoyee par l'apercu.
 * Audit B5 (Haute): l'apercu ("extract") produit `description: null` pour un
 * plat sans description, et l'etape "import" refusait `null`: toute la carte
 * repondait 400 des qu'un plat n'avait pas de description.
 * Audit B6 (Basse): ce chemin n'avait aucune borne (prix negatif, nom vide).
 */

vi.mock('@/lib/billing/assert-tenant-serving', () => ({
  assertTenantServing: vi.fn(async () => undefined),
}));
vi.mock('@/lib/csrf', () => ({ verifyOrigin: vi.fn(() => null) }));
vi.mock('@/lib/rate-limit', () => ({
  pdfImportLimiter: { check: vi.fn(async () => ({ success: true })) },
  getClientIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const importItems = vi.fn(async () => ({
  categoriesCreated: 1,
  categoriesExisting: 0,
  itemsCreated: 1,
  itemsUpdated: 0,
  itemsSkipped: 0,
  errors: [],
}));
vi.mock('@/services/pdf-import.service', () => ({
  createPdfImportService: vi.fn(() => ({ importItems, extractFromPdf: vi.fn() })),
}));
vi.mock('@/services/plan-enforcement.service', () => ({
  createPlanEnforcementService: vi.fn(() => ({ canAddItems: vi.fn(async () => undefined) })),
}));

const supabase = {
  from: vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.single = vi.fn(async () => ({
      data: { id: 't1', subscription_plan: 'starter' },
      error: null,
    }));
    chain.maybeSingle = vi.fn(async () => ({ data: table === 'menus' ? { id: 'm1' } : null }));
    return chain;
  }),
};
vi.mock('@/lib/auth/get-session', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/auth/get-session')>('@/lib/auth/get-session');
  return {
    ...actual,
    getAuthenticatedUserWithTenant: vi.fn(async () => ({ tenantId: 't1', supabase })),
  };
});

import { POST } from '../menu-import-pdf/route';

function post(items: unknown): Promise<Response> {
  const fd = new FormData();
  fd.append('menuId', 'm1');
  fd.append('action', 'import');
  fd.append('items', JSON.stringify(items));
  return POST(new Request('http://localhost/api/menu-import-pdf', { method: 'POST', body: fd }));
}

const plat = { category: 'Plats', name: 'Riz gras', description: 'maison', price: 2500 };

describe('POST /api/menu-import-pdf - liste JSON de l apercu', () => {
  beforeEach(() => importItems.mockClear());

  it('B5: accepte un plat sans description (null, forme produite par l apercu)', async () => {
    const res = await post([{ ...plat, description: null }]);
    expect(res.status).toBe(200);
    expect(importItems).toHaveBeenCalledTimes(1);
  });

  it('temoin: le meme plat avec une description texte passe', async () => {
    const res = await post([plat]);
    expect(res.status).toBe(200);
  });

  it.each([
    ['prix negatif', { ...plat, price: -5000 }],
    ['prix au-dela de la colonne numeric(10,2)', { ...plat, price: 100_000_000 }],
    ['nom vide', { ...plat, name: '   ' }],
    ['rubrique vide', { ...plat, category: '' }],
    ['nom trop long', { ...plat, name: 'x'.repeat(201) }],
    ['description trop longue', { ...plat, description: 'x'.repeat(1001) }],
  ])('B6: refuse %s sans rien importer', async (_l, item) => {
    const res = await post([item]);
    expect(res.status).toBe(400);
    expect(importItems).not.toHaveBeenCalled();
  });
});
