import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MENU_WITH_PRICE } from '@/lib/admin-roles';
import type { PermissionMap } from '@/types/permission.types';

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
const extractFromPdf = vi.fn();
vi.mock('@/services/pdf-import.service', () => ({
  createPdfImportService: vi.fn(() => ({ importItems, extractFromPdf })),
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
// Garde de droits (dernier describe): la VRAIE getAuthenticatedUserWithTenant lit
// la session par ces deux modules, simules ici.
const mockCreateClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

const mockAuth = vi.fn(async (...args: unknown[]) => {
  void args;
  return { tenantId: 't1', supabase };
});
vi.mock('@/lib/auth/get-session', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/auth/get-session')>('@/lib/auth/get-session');
  return {
    ...actual,
    getAuthenticatedUserWithTenant: (requirement?: unknown) => mockAuth(requirement),
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

  // B72 (contre-audit 2): un plat a 0 venu de l'apercu serait en vente gratuitement.
  it('refuse un plat a 0 (400, message clair) sans rien importer', async () => {
    const res = await post([plat, { ...plat, name: 'Poulet DG', price: 0 }]);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('ajoutez-le à la main');
    expect(importItems).not.toHaveBeenCalled();
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

// B71: l'import direct (fichier sans apercu) importait une carte lue en partie
// (texte coupe a 15 000 caracteres) comme si elle etait complete.
describe('POST /api/menu-import-pdf - import direct d une carte lue en partie (B71)', () => {
  beforeEach(() => {
    importItems.mockClear();
    extractFromPdf.mockReset();
  });

  function postFile(): Promise<Response> {
    const fd = new FormData();
    fd.append('menuId', 'm1');
    fd.append('action', 'import');
    fd.append('file', new File(['%PDF'], 'carte.pdf', { type: 'application/pdf' }));
    return POST(new Request('http://localhost/api/menu-import-pdf', { method: 'POST', body: fd }));
  }

  it('refuse et n importe rien quand la carte est tronquee', async () => {
    extractFromPdf.mockResolvedValue({
      items: [plat],
      pageCount: 9,
      textLength: 20000,
      truncated: true,
      notImported: [],
    });
    const res = await postFile();
    expect(res.status).toBe(400);
    expect(importItems).not.toHaveBeenCalled();
  });

  // B72 (contre-audit 1): un prix FCFA illisible sans deviner ne part pas a 0
  // sur la carte par l'import direct, qui n'a pas d'apercu.
  it('refuse et n importe rien quand un prix est illisible', async () => {
    extractFromPdf.mockResolvedValue({
      items: [plat],
      pageCount: 1,
      textLength: 500,
      truncated: false,
      notImported: [{ name: 'Braise', price: '1,500.50', reason: 'decimale' }],
    });
    const res = await postFile();
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('Braise');
    expect(importItems).not.toHaveBeenCalled();
  });

  it('temoin: une carte lue en entier s importe', async () => {
    extractFromPdf.mockResolvedValue({
      items: [plat],
      pageCount: 1,
      textLength: 500,
      truncated: false,
      notImported: [],
    });
    const res = await postFile();
    expect(res.status).toBe(200);
    expect(importItems).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Garde de droits: importer une carte cree des plats AVEC leurs prix, donc
// `menu.edit` ET `menu.price`. La VRAIE getAuthenticatedUserWithTenant resout les
// droits sur un client de base simule; le 403 doit tomber AVANT toute ecriture.
// ---------------------------------------------------------------------------

describe('POST /api/menu-import-pdf - garde menu.edit + menu.price', () => {
  function gateClient(postes: string[], overrides: PermissionMap | null) {
    const writes = vi.fn();
    const tablesRead: string[] = [];
    const memberChain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'order', 'limit']) memberChain[m] = () => memberChain;
    memberChain.maybeSingle = async () => ({
      data: { id: 'adm-1', tenant_id: 't1', postes, permission_overrides: overrides },
      error: null,
    });
    const posteChain: Record<string, unknown> = {};
    for (const m of ['select', 'eq']) posteChain[m] = () => posteChain;
    posteChain.in = async () => ({ data: [], error: null });
    const client = {
      auth: {
        getUser: async () => ({ data: { user: { id: 'u1', email: 'u@test.com' } }, error: null }),
      },
      rpc: writes,
      from: vi.fn((table: string) => {
        tablesRead.push(table);
        if (table === 'admin_users') return memberChain;
        if (table === 'poste_permissions') return posteChain;
        const base = supabase.from(table) as Record<string, unknown>;
        for (const m of ['insert', 'update', 'upsert', 'delete']) base[m] = writes;
        return base;
      }),
    };
    return { client, writes, tablesRead };
  }

  async function asMember(postes: string[], overrides: PermissionMap | null = null) {
    const g = gateClient(postes, overrides);
    mockCreateClient.mockResolvedValue(g.client);
    const actual =
      await vi.importActual<typeof import('@/lib/auth/get-session')>('@/lib/auth/get-session');
    mockAuth.mockImplementation(
      (requirement?: unknown) =>
        actual.getAuthenticatedUserWithTenant(
          requirement as Parameters<typeof actual.getAuthenticatedUserWithTenant>[0],
        ) as never,
    );
    return g;
  }

  function postImport(): Promise<Response> {
    return post([plat]);
  }

  beforeEach(() => importItems.mockClear());

  it('la garde exige menu.edit ET menu.price', () => {
    expect([...MENU_WITH_PRICE].sort()).toEqual(['menu.edit', 'menu.price']);
  });

  it.each([
    ['menu.edit SANS menu.price (chef, prix retire)', ['chef'], { 'menu.price': false }],
    ['menu.price SANS menu.edit (gerant, edition retiree)', ['manager'], { 'menu.edit': false }],
    ['serveur (aucun des deux)', ['waiter'], null],
    ['caissier (aucun des deux)', ['cashier'], null],
  ])('%s: 403 avant toute ecriture', async (_label, postes, overrides) => {
    const g = await asMember(postes, overrides);

    const res = await postImport();

    expect(res.status).toBe(403);
    expect(importItems).not.toHaveBeenCalled();
    expect(g.writes).not.toHaveBeenCalled();
    // Le client de base n'a lu que la ligne de membre et ses reglages: rien d'autre.
    expect(new Set(g.tablesRead)).toEqual(new Set(['admin_users', 'poste_permissions']));
  });

  it.each([
    ['chef (menu.edit et menu.price par defaut)', ['chef'], null],
    ['gerant', ['manager'], null],
    ['proprietaire', ['owner'], null],
  ])('temoin: %s passe la garde et importe', async (_label, postes, overrides) => {
    await asMember(postes, overrides);

    const res = await postImport();

    expect(res.status).toBe(200);
    expect(importItems).toHaveBeenCalledTimes(1);
  });
});
