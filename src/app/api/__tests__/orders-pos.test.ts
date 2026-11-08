import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextResponse } from 'next/server';
import { canAccessFeature } from '@/lib/plans/features';
import { checkAndNotifyLowStock } from '@/services/notification.service';
import * as Sentry from '@sentry/nextjs';

// --- Mock external dependencies --------------------------------
// after() runs its callback inline (quota check); NextResponse kept real.
vi.mock('next/server', async (importActual) => {
  const actual = await importActual<typeof import('next/server')>();
  return {
    ...actual,
    after: (cb: () => unknown) => {
      void cb();
    },
  };
});

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockRateLimitCheck = vi.fn<() => Promise<{ success: boolean }>>();
vi.mock('@/lib/rate-limit', () => ({
  orderLimiter: { check: (...args: unknown[]) => mockRateLimitCheck(...(args as [])) },
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/csrf', () => ({
  verifyOrigin: vi.fn(() => null),
}));

// Authenticated POS user + session-derived tenant (IDOR prevention).
class MockAuthError extends Error {}
const mockGetAuthUser = vi.fn();
vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserWithTenant: () => mockGetAuthUser(),
  AuthError: MockAuthError,
}));

// --- Order service mock ----------------------------------------
const mockFindByClientRequestId = vi.fn();
const mockValidateOrderItems = vi.fn();
const mockDeterminePreparationZone = vi.fn();
const mockCreateOrderWithItems = vi.fn();
const mockCloseSession = vi.fn();
vi.mock('@/services/order.service', () => ({
  createOrderService: vi.fn(() => ({
    findOrderByClientRequestId: mockFindByClientRequestId,
    validateOrderItems: mockValidateOrderItems,
    determinePreparationZone: mockDeterminePreparationZone,
    createOrderWithItems: mockCreateOrderWithItems,
    closeSessionIfFullySettled: mockCloseSession,
  })),
}));

vi.mock('@/services/coupon.service', () => ({
  createCouponService: vi.fn(() => ({
    validateCoupon: vi.fn(),
    claimUsage: vi.fn(),
    unclaimUsage: vi.fn(),
    recordRedemption: vi.fn(),
  })),
}));

// Quota check runs in after(); keep it inert. The order-feature plan gate is
// exercised in its own unit test, so keep it inert here (no-op assert).
vi.mock('@/services/plan-enforcement.service', () => ({
  createPlanEnforcementService: vi.fn(() => ({
    getMonthlyOrderUsage: vi.fn().mockResolvedValue({ count: 0, limit: null, exceeded: false }),
  })),
  assertOrderFeaturesAllowed: vi.fn(),
}));

const mockCalculateOrderTotal = vi.fn();
vi.mock('@/lib/pricing/tax', () => ({
  calculateOrderTotal: (...args: unknown[]) => mockCalculateOrderTotal(...args),
}));

// --- Inventory service mock ------------------------------------
const mockDestockOrder = vi.fn<() => Promise<number>>();
vi.mock('@/services/inventory.service', () => ({
  createInventoryService: vi.fn(() => ({ destockOrder: mockDestockOrder })),
}));

vi.mock('@/services/notification.service', () => ({
  checkAndNotifyLowStock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/lib/plans/features', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/plans/features')>()),
  canAccessFeature: vi.fn(() => false),
}));

// --- Menu items query mock -------------------------------------
const mockFetchMenuItems = vi.fn();
vi.mock('@/lib/menu-items-query', () => ({
  fetchMenuItemsByIds: (...args: unknown[]) => mockFetchMenuItems(...args),
}));

// --- Admin Supabase client mock (chainable) --------------------
// admin_users -> single(); tenants -> single(); notifications -> insert() thenable.
const mockAdminUserRow = { data: { id: 'server-1', tenant_id: 'tenant-abc', role: 'cashier' } };
interface MockTenantRow {
  is_active: boolean;
  suspended_at: string | null;
  currency: string;
  tax_rate: number;
  service_charge_rate: number;
  enable_tax: boolean;
  enable_service_charge: boolean;
  subscription_plan: string;
  subscription_status: string | null;
  trial_ends_at: string | null;
}

const mockTenantRow: { data: MockTenantRow | null; error: null } = {
  data: {
    // Verrous de coupure: la caisse les lit maintenant AVANT tout effet de bord.
    // Une fixture qui les omet decrit un restaurant coupe, pas un restaurant qui
    // sert - et ferait echouer toute cette suite en 403.
    is_active: true,
    suspended_at: null,
    currency: 'XAF',
    tax_rate: 0,
    service_charge_rate: 0,
    enable_tax: false,
    enable_service_charge: false,
    subscription_plan: 'business',
    subscription_status: 'active',
    trial_ends_at: null,
  },
  error: null,
};

function makeChain(resolved: unknown) {
  const chain: Record<string, unknown> = {};
  // `neq` et `in` sont les maillons des gardes d'encaissement (ne pas regler une
  // commande annulee; compter 'pending' ET 'partial' comme de l'argent du).
  for (const m of ['select', 'eq', 'neq', 'in', 'is', 'order', 'limit', 'update']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn().mockResolvedValue(resolved);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolved);
  return chain;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'admin_users') return makeChain(mockAdminUserRow);
      if (table === 'tenants') return makeChain(mockTenantRow);
      if (table === 'notifications') {
        return { insert: vi.fn(() => Promise.resolve({ error: null })) };
      }
      return makeChain({ data: null, error: null });
    }),
  })),
}));

// --- Helpers ---------------------------------------------------
const MENU_ITEM_ID = '11111111-1111-4111-a111-111111111111';

function validPosBody() {
  return {
    table_number: '5',
    status: 'pending' as const,
    service_type: 'dine_in' as const,
    items: [{ menu_item_id: MENU_ITEM_ID, quantity: 2 }],
  };
}

function createMockRequest(body: unknown): Request {
  return new Request('http://localhost/api/orders/pos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify(body),
  });
}

async function parseResponse(
  response: NextResponse,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

// --- Test Suite - POS auto-destock wiring ----------------------
describe('POST /api/orders/pos - auto-destock wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimitCheck.mockResolvedValue({ success: true });
    mockGetAuthUser.mockResolvedValue({
      tenantId: 'tenant-abc',
      user: { id: 'user-1' },
      role: 'cashier',
    });
    mockFindByClientRequestId.mockResolvedValue(null);
    mockFetchMenuItems.mockResolvedValue({
      data: [
        {
          id: MENU_ITEM_ID,
          name: 'Pizza',
          name_en: null,
          price: 5000,
          is_available: true,
          category_id: 'cat-1',
        },
      ],
      error: null,
    });
    mockValidateOrderItems.mockResolvedValue({
      validatedTotal: 10000,
      verifiedPrices: new Map(),
      itemCategoryMap: new Map(),
    });
    mockDeterminePreparationZone.mockResolvedValue({
      orderZone: 'kitchen',
      categoryZoneMap: new Map(),
    });
    mockCalculateOrderTotal.mockReturnValue({
      subtotal: 10000,
      taxAmount: 0,
      serviceChargeAmount: 0,
      discountAmount: 0,
      total: 10000,
    });
    mockCreateOrderWithItems.mockResolvedValue({
      orderId: 'order-pos-1',
      orderNumber: 'POS-001',
      total: 10000,
      deduplicated: false,
    });
  });

  it('destocks the order when the plan grants inventory', async () => {
    vi.mocked(canAccessFeature).mockReturnValue(true);
    mockDestockOrder.mockResolvedValue(1);

    const { POST } = await import('@/app/api/orders/pos/route');
    const response = await POST(createMockRequest(validPosBody()));
    const { status } = await parseResponse(response);

    expect(status).toBe(200);
    await vi.waitFor(() => {
      expect(mockDestockOrder).toHaveBeenCalledWith('order-pos-1', 'tenant-abc', 'user-1');
      expect(vi.mocked(checkAndNotifyLowStock)).toHaveBeenCalledWith('tenant-abc');
    });
  });

  it('does NOT destock when the plan lacks inventory', async () => {
    vi.mocked(canAccessFeature).mockReturnValue(false);

    const { POST } = await import('@/app/api/orders/pos/route');
    const response = await POST(createMockRequest(validPosBody()));
    const { status } = await parseResponse(response);

    expect(status).toBe(200);
    expect(mockDestockOrder).not.toHaveBeenCalled();
  });

  it('keeps the order successful and reports to Sentry when destock fails', async () => {
    vi.mocked(canAccessFeature).mockReturnValue(true);
    mockDestockOrder.mockRejectedValue(new Error('destock RPC boom'));

    const { POST } = await import('@/app/api/orders/pos/route');
    const response = await POST(createMockRequest(validPosBody()));
    const { status, body } = await parseResponse(response);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    await vi.waitFor(() => {
      expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ tags: { area: 'inventory-destock' } }),
      );
    });
  });
});

// --- Test Suite - coupure du restaurant -----------------------
/**
 * Cette route n'a longtemps porte AUCUNE coupure. Elle lisait bien
 * `subscription_status`, mais seulement pour choisir les fonctionnalites du
 * plan - et un restaurant gele retombe sur `starter`, dont `canAccessPOS` vaut
 * `true`. Un restaurant gele, suspendu ou desactive encaissait donc
 * normalement, alors que le canal convive etait coupe depuis F6/CTR7-1. Le
 * verrou du middleware ne pouvait pas rattraper ca: il ne garde que les PAGES.
 */
describe('POST /api/orders/pos - coupure du restaurant', () => {
  const ligneServante = { ...(mockTenantRow.data as MockTenantRow) };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantRow.data = { ...ligneServante };
    mockRateLimitCheck.mockResolvedValue({ success: true });
    mockGetAuthUser.mockResolvedValue({
      tenantId: 'tenant-abc',
      user: { id: 'user-1' },
      role: 'cashier',
    });
    mockFindByClientRequestId.mockResolvedValue(null);
    mockFetchMenuItems.mockResolvedValue({
      data: [
        {
          id: MENU_ITEM_ID,
          name: 'Pizza',
          name_en: null,
          price: 5000,
          is_available: true,
          category_id: 'cat-1',
        },
      ],
      error: null,
    });
    mockValidateOrderItems.mockResolvedValue({
      validatedTotal: 10000,
      verifiedPrices: new Map(),
      itemCategoryMap: new Map(),
    });
    mockDeterminePreparationZone.mockResolvedValue({
      orderZone: 'kitchen',
      categoryZoneMap: new Map(),
    });
    mockCalculateOrderTotal.mockReturnValue({
      subtotal: 10000,
      taxAmount: 0,
      serviceChargeAmount: 0,
      discountAmount: 0,
      total: 10000,
    });
    mockCreateOrderWithItems.mockResolvedValue({
      orderId: 'order-pos-1',
      orderNumber: 'POS-001',
      total: 10000,
      deduplicated: false,
    });
  });

  afterEach(() => {
    mockTenantRow.data = { ...ligneServante };
  });

  const casCoupes: [string, Partial<typeof ligneServante>][] = [
    ['gele', { subscription_status: 'frozen' }],
    ['resilie', { subscription_status: 'cancelled' }],
    ['suspendu par le super-admin', { suspended_at: '2026-11-01T00:00:00Z' }],
    ['desactive', { is_active: false }],
  ];

  it.each(casCoupes)(
    'refuse en 403 et ne cree AUCUNE commande quand le restaurant est %s',
    async (_cas, etat) => {
      mockTenantRow.data = { ...ligneServante, ...etat };

      const { POST } = await import('@/app/api/orders/pos/route');
      const response = await POST(createMockRequest(validPosBody()));
      const { status } = await parseResponse(response);

      expect(status).toBe(403);
      // Le coeur du constat: pas de commande, donc pas de `payment_status: paid`,
      // pas de ligne dans `payments`, pas de session de table soldee.
      expect(mockCreateOrderWithItems).not.toHaveBeenCalled();
      expect(mockDestockOrder).not.toHaveBeenCalled();
    },
  );

  it("refuse AVANT le rejeu hors ligne: une file d'attente ne peut pas encaisser apres le gel", async () => {
    // LE PLACEMENT EST LA MOITIE DU CORRECTIF. Le chemin `client_request_id`
    // rappelle `applyPosFinalState` (donc le passage a `paid`) AVANT la lecture
    // de configuration du restaurant. Une coupure posee la-bas laisserait une
    // tablette hors ligne encaisser toute sa file apres le gel.
    mockTenantRow.data = { ...ligneServante, subscription_status: 'frozen' };
    mockFindByClientRequestId.mockResolvedValue({
      orderId: 'order-deja-la',
      orderNumber: 'POS-000',
      total: 10000,
    });

    const { POST } = await import('@/app/api/orders/pos/route');
    const response = await POST(
      createMockRequest({
        ...validPosBody(),
        payment_method: 'cash',
        client_request_id: '22222222-2222-4222-a222-222222222222',
      }),
    );
    const { status } = await parseResponse(response);

    expect(status).toBe(403);
    // La preuve que la coupure est en amont: le chemin d'idempotence n'est
    // meme pas consulte.
    expect(mockFindByClientRequestId).not.toHaveBeenCalled();
  });

  it.each([['trial'], ['past_due']])(
    'laisse encaisser un restaurant en statut %s',
    async (statut) => {
      // `past_due` doit rester servant: la relance Stripe est en cours et le
      // cron de gel le borne. Couper ici couperait un client qui va payer.
      mockTenantRow.data = { ...ligneServante, subscription_status: statut };

      const { POST } = await import('@/app/api/orders/pos/route');
      const response = await POST(createMockRequest(validPosBody()));
      const { status } = await parseResponse(response);

      expect(status).toBe(200);
      expect(mockCreateOrderWithItems).toHaveBeenCalled();
    },
  );

  it('repond 404 quand le restaurant est introuvable ou supprime', async () => {
    mockTenantRow.data = null;

    const { POST } = await import('@/app/api/orders/pos/route');
    const response = await POST(createMockRequest(validPosBody()));
    const { status } = await parseResponse(response);

    expect(status).toBe(404);
    expect(mockCreateOrderWithItems).not.toHaveBeenCalled();
  });
});
