import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEffectiveLevels } from '@/lib/permissions';
import { MENU_WITH_PRICE } from '@/lib/admin-roles';
import type { PermissionMap } from '@/types/permission.types';

// Coupure du restaurant (A-02): la garde est simulee ici, ses refus sont testes
// dans tenant-lock-routes.test.ts.
vi.mock('@/lib/billing/assert-tenant-serving', () => ({
  assertTenantServing: vi.fn(async () => undefined),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockVerifyOrigin = vi.fn();
const mockExcelLimiterCheck = vi.fn();
const mockGetAuthenticatedUserWithTenant = vi.fn();
const mockImportFromExcel = vi.fn();
const mockRemainingItemSlots = vi.fn();

vi.mock('@/lib/csrf', () => ({
  verifyOrigin: (...args: unknown[]) => mockVerifyOrigin(...args),
}));

vi.mock('@/lib/rate-limit', () => ({
  excelImportLimiter: { check: (...args: unknown[]) => mockExcelLimiterCheck(...args) },
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// Garde de droits (describe plus bas): la VRAIE getAuthenticatedUserWithTenant lit
// la session par ces deux modules, simules ici.
const mockCreateClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

vi.mock('@/services/excel-import.service', () => ({
  createExcelImportService: vi.fn(() => ({
    importFromExcel: (...args: unknown[]) => mockImportFromExcel(...args),
    generateTemplate: vi.fn(),
  })),
}));

vi.mock('@/services/plan-enforcement.service', () => ({
  createPlanEnforcementService: vi.fn(() => ({
    remainingItemSlots: (...args: unknown[]) => mockRemainingItemSlots(...args),
  })),
}));

// AuthError is needed by the route for its catch block; re-export the real one.
vi.mock('@/lib/auth/get-session', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/auth/get-session')>('@/lib/auth/get-session');
  return {
    ...actual,
    getAuthenticatedUserWithTenant: (...args: unknown[]) =>
      mockGetAuthenticatedUserWithTenant(...args),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function buildFormData(menuId: string): FormData {
  const formData = new FormData();
  const file = new File([new Uint8Array([1, 2, 3])], 'menu.xlsx', { type: XLSX_MIME });
  formData.append('file', file);
  formData.append('menuId', menuId);
  return formData;
}

function buildRequest(formData: FormData): Request {
  return new Request('http://localhost:3000/api/menu-import', {
    method: 'POST',
    body: formData,
  });
}

// menusEq tracks the .eq('tenant_id', ...) call on the menus lookup.
let menusEq: ReturnType<typeof vi.fn>;

function createMockSupabase(menuResult: { data: unknown }) {
  menusEq = vi.fn();

  return {
    from: vi.fn((table: string) => {
      if (table === 'tenants') {
        const single = vi.fn().mockResolvedValue({
          data: {
            id: 'tenant-1',
            name: 'Test',
            slug: 'test',
            currency: 'XOF',
            subscription_plan: 'pro',
            subscription_status: 'active',
            trial_ends_at: null,
            is_active: true,
            created_at: '2025-01-01',
          },
          error: null,
        });
        const eqId = vi.fn(() => ({ single }));
        const select = vi.fn(() => ({ eq: eqId }));
        return { select };
      }
      if (table === 'menus') {
        const maybeSingle = vi.fn().mockResolvedValue(menuResult);
        menusEq.mockReturnValue({ maybeSingle });
        const eqId = vi.fn(() => ({ eq: menusEq }));
        const select = vi.fn(() => ({ eq: eqId }));
        return { select };
      }
      return {};
    }),
  };
}

function mockAuth(supabase: unknown) {
  mockGetAuthenticatedUserWithTenant.mockResolvedValue({
    user: { id: 'user-1', email: 'owner@test.com' },
    tenantId: 'tenant-1',
    postes: ['owner'],
    isOwner: true,
    levels: getEffectiveLevels({ postes: ['owner'] }),
    supabase,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/menu-import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyOrigin.mockReturnValue(null);
    mockExcelLimiterCheck.mockResolvedValue({ success: true });
    mockRemainingItemSlots.mockResolvedValue(12);
    mockImportFromExcel.mockResolvedValue({
      categoriesCreated: 0,
      categoriesExisting: 0,
      itemsCreated: 1,
      itemsSkipped: 0,
    });
  });

  it('returns 404 and does not import when the menu belongs to another tenant', async () => {
    const supabase = createMockSupabase({ data: null });
    mockAuth(supabase);

    const { POST } = await import('../menu-import/route');
    const res = await POST(buildRequest(buildFormData('foreign-menu')));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(404);
    expect(json.error).toBe('Menu non trouve');
    // The menus lookup must be scoped to the session tenant.
    expect(menusEq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    // No cross-tenant import is allowed to proceed.
    expect(mockImportFromExcel).not.toHaveBeenCalled();
  });

  it('imports when the menu belongs to the session tenant', async () => {
    const supabase = createMockSupabase({ data: { id: 'menu-1' } });
    mockAuth(supabase);

    const { POST } = await import('../menu-import/route');
    const res = await POST(buildRequest(buildFormData('menu-1')));
    const json = (await res.json()) as { success: boolean };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(menusEq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    // Le reste du forfait est transmis: seuls les NOUVEAUX plats sont limites.
    // B72: la devise du restaurant est transmise (lecture des prix en texte).
    expect(mockImportFromExcel).toHaveBeenCalledWith(
      'tenant-1',
      'menu-1',
      expect.anything(),
      { maxNewItems: 12 },
      'XOF',
    );
  });
});

// ---------------------------------------------------------------------------
// Garde de droits: importer une carte cree des plats AVEC leurs prix, donc
// `menu.edit` ET `menu.price`. La VRAIE getAuthenticatedUserWithTenant resout les
// droits sur un client de base simule; le 403 doit tomber AVANT toute ecriture.
// ---------------------------------------------------------------------------

describe('POST /api/menu-import - garde menu.edit + menu.price', () => {
  /** Client de base: ligne de membre + reglages vides, le reste delegue au client metier. */
  function gateClient(postes: string[], overrides: PermissionMap | null) {
    const business = createMockSupabase({ data: { id: 'menu-1' } });
    const writes = vi.fn();
    const tablesRead: string[] = [];
    const memberChain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'order', 'limit']) memberChain[m] = () => memberChain;
    memberChain.maybeSingle = async () => ({
      data: { id: 'adm-1', tenant_id: 'tenant-1', postes, permission_overrides: overrides },
      error: null,
    });
    const posteChain: Record<string, unknown> = {};
    for (const m of ['select', 'eq']) posteChain[m] = () => posteChain;
    posteChain.in = async () => ({ data: [], error: null });
    const client = {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'user-1', email: 'u@test.com' } },
          error: null,
        }),
      },
      rpc: writes,
      from: vi.fn((table: string) => {
        tablesRead.push(table);
        if (table === 'admin_users') return memberChain;
        if (table === 'poste_permissions') return posteChain;
        // Toute ecriture sur une autre table doit etre vue: insert/update/upsert/delete.
        const base = business.from(table) as Record<string, unknown>;
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
    mockGetAuthenticatedUserWithTenant.mockImplementation(
      (req?: Parameters<typeof actual.getAuthenticatedUserWithTenant>[0]) =>
        actual.getAuthenticatedUserWithTenant(req),
    );
    return g;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyOrigin.mockReturnValue(null);
    mockExcelLimiterCheck.mockResolvedValue({ success: true });
    mockRemainingItemSlots.mockResolvedValue(12);
    mockImportFromExcel.mockResolvedValue({
      categoriesCreated: 0,
      categoriesExisting: 0,
      itemsCreated: 1,
      itemsSkipped: 0,
    });
  });

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
    const { POST } = await import('../menu-import/route');

    const res = await POST(buildRequest(buildFormData('menu-1')));

    expect(res.status).toBe(403);
    expect(mockImportFromExcel).not.toHaveBeenCalled();
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
    const { POST } = await import('../menu-import/route');

    const res = await POST(buildRequest(buildFormData('menu-1')));

    expect(res.status).toBe(200);
    expect(mockImportFromExcel).toHaveBeenCalledTimes(1);
  });
});
