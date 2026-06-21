import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockVerifyOrigin = vi.fn();
const mockExcelLimiterCheck = vi.fn();
const mockGetAuthenticatedUserWithTenant = vi.fn();
const mockImportFromExcel = vi.fn();
const mockCanAddMenuItem = vi.fn();

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

vi.mock('@/services/excel-import.service', () => ({
  createExcelImportService: vi.fn(() => ({
    importFromExcel: (...args: unknown[]) => mockImportFromExcel(...args),
    generateTemplate: vi.fn(),
  })),
}));

vi.mock('@/services/plan-enforcement.service', () => ({
  createPlanEnforcementService: vi.fn(() => ({
    canAddMenuItem: (...args: unknown[]) => mockCanAddMenuItem(...args),
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
    role: 'owner',
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
    mockCanAddMenuItem.mockResolvedValue(undefined);
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
    expect(mockImportFromExcel).toHaveBeenCalledWith('tenant-1', 'menu-1', expect.anything());
  });
});
