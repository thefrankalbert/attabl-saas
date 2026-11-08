import { describe, it, expect, vi, beforeEach } from 'vitest';
import { canAccessFeature } from '@/lib/plans/features';
import * as Sentry from '@sentry/nextjs';

// --- Mocks -----------------------------------------------------
// after() callbacks are COLLECTED, not run inline: that is the only way to tell
// scheduled work apart from a bare fire-and-forget promise (which the serverless
// freeze after the response can swallow whole).
const afterCallbacks: (() => unknown)[] = [];
vi.mock('next/server', async (importActual) => {
  const actual = await importActual<typeof import('next/server')>();
  return {
    ...actual,
    after: (cb: () => unknown) => {
      afterCallbacks.push(cb);
    },
  };
});

async function runScheduled() {
  const pending = afterCallbacks.splice(0, afterCallbacks.length);
  for (const cb of pending) await cb();
}

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// Authenticated supabase client used for the tenant plan lookup.
function makeChain(resolved: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is']) chain[m] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolved);
  return chain;
}
const mockAuthedSupabase = {
  from: vi.fn(() =>
    makeChain({
      data: {
        subscription_plan: 'business',
        subscription_status: 'active',
        trial_ends_at: null,
        // Colonnes de coupure: une fixture qui les omet decrit un restaurant
        // COUPE (assertTenantServing echoue ferme), pas un restaurant normal.
        is_active: true,
        suspended_at: null,
      },
    }),
  ),
};

class MockAuthError extends Error {}
const mockGetAuthUserForTenant = vi.fn();
vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserForTenant: (...args: unknown[]) => mockGetAuthUserForTenant(...args),
  AuthError: MockAuthError,
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({})) }));

const mockCancelOrder = vi.fn();
const mockUpdateStatus = vi.fn();
vi.mock('@/services/order.service', () => ({
  createOrderService: vi.fn(() => ({
    cancelOrder: mockCancelOrder,
    updateStatus: mockUpdateStatus,
  })),
}));

const mockRestockOrder = vi.fn<() => Promise<number>>();
vi.mock('@/services/inventory.service', () => ({
  createInventoryService: vi.fn(() => ({ restockOrder: mockRestockOrder })),
}));

const mockAuditLog = vi.fn();
vi.mock('@/services/audit.service', () => ({
  createAuditService: vi.fn(() => ({ log: mockAuditLog })),
}));

const mockCompOrder = vi.fn();
vi.mock('@/services/payment.service', () => ({
  createPaymentService: vi.fn(() => ({ compOrder: mockCompOrder })),
}));

vi.mock('@/services/order-annotation.service', () => ({
  createOrderAnnotationService: vi.fn(() => ({})),
}));

// `tenantLockReason` (coupure du restaurant) lit `isSubscriptionUsable` dans ce
// meme module: un mock qui ne rend que `canAccessFeature` le fait echouer en
// "Erreur interne". On garde donc la vraie implementation du reste du module.
vi.mock('@/lib/plans/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/plans/features')>()),
  canAccessFeature: vi.fn(() => false),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

const TENANT_ID = '22222222-2222-4222-a222-222222222222';
const ORDER_ID = '33333333-3333-4333-a333-333333333333';

describe('actionUpdateOrderStatus - cancel auto-restock wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUserForTenant.mockResolvedValue({
      supabase: mockAuthedSupabase,
      user: { id: 'user-9' },
    });
    mockAuthedSupabase.from.mockReturnValue(
      makeChain({
        data: {
          subscription_plan: 'business',
          subscription_status: 'active',
          trial_ends_at: null,
          is_active: true,
          suspended_at: null,
        },
      }),
    );
    mockCancelOrder.mockResolvedValue(undefined);
    mockUpdateStatus.mockResolvedValue(undefined);
    afterCallbacks.length = 0;
  });

  it('restocks after cancel when the plan grants inventory, via after()', async () => {
    vi.mocked(canAccessFeature).mockReturnValue(true);
    mockRestockOrder.mockResolvedValue(1);

    const { actionUpdateOrderStatus } = await import('@/app/actions/orders');
    const result = await actionUpdateOrderStatus(TENANT_ID, ORDER_ID, 'cancelled');

    expect(result.success).toBe(true);
    expect(mockCancelOrder).toHaveBeenCalledWith(ORDER_ID, TENANT_ID);
    // Queued, not raced: nothing has run when the action returns.
    expect(mockRestockOrder).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);

    await runScheduled();

    expect(mockRestockOrder).toHaveBeenCalledWith(ORDER_ID, TENANT_ID, 'user-9');
  });

  it('does NOT restock when the plan lacks inventory', async () => {
    vi.mocked(canAccessFeature).mockReturnValue(false);

    const { actionUpdateOrderStatus } = await import('@/app/actions/orders');
    const result = await actionUpdateOrderStatus(TENANT_ID, ORDER_ID, 'cancelled');

    expect(result.success).toBe(true);
    expect(mockCancelOrder).toHaveBeenCalledWith(ORDER_ID, TENANT_ID);
    expect(mockRestockOrder).not.toHaveBeenCalled();
  });

  it('does NOT restock for a non-cancel status change', async () => {
    vi.mocked(canAccessFeature).mockReturnValue(true);

    const { actionUpdateOrderStatus } = await import('@/app/actions/orders');
    const result = await actionUpdateOrderStatus(TENANT_ID, ORDER_ID, 'ready');

    expect(result.success).toBe(true);
    expect(mockUpdateStatus).toHaveBeenCalledWith(ORDER_ID, TENANT_ID, 'ready');
    expect(mockCancelOrder).not.toHaveBeenCalled();
    expect(mockRestockOrder).not.toHaveBeenCalled();
  });

  it('keeps cancel successful and reports to Sentry when restock fails', async () => {
    vi.mocked(canAccessFeature).mockReturnValue(true);
    mockRestockOrder.mockRejectedValue(new Error('restock RPC boom'));

    const { actionUpdateOrderStatus } = await import('@/app/actions/orders');
    const result = await actionUpdateOrderStatus(TENANT_ID, ORDER_ID, 'cancelled');

    // Non-blocking: cancel still succeeds even if restock throws.
    expect(result.success).toBe(true);

    await runScheduled();

    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { area: 'inventory-restock' } }),
    );
  });
});

describe('actionCompOrder - manager gating + audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUserForTenant.mockResolvedValue({
      supabase: mockAuthedSupabase,
      user: { id: 'user-9', email: 'boss@resto.test' },
      adminUserId: 'admin-9',
    });
    mockCompOrder.mockResolvedValue({
      summary: { paymentStatus: 'comp' },
      comped: true,
    });
  });

  it('is gated to ORDER_MONEY_ROLES (NOT cashier/chef/waiter) and derives compedBy = adminUserId', async () => {
    const { actionCompOrder } = await import('@/app/actions/orders');
    const result = await actionCompOrder(TENANT_ID, ORDER_ID, 'Geste commercial');

    expect(result.success).toBe(true);
    expect(result.paymentStatus).toBe('comp');
    // Deliberately narrower than `orders.manage`, which cashier and chef hold too.
    expect(mockGetAuthUserForTenant).toHaveBeenCalledWith(
      TENANT_ID,
      ['owner', 'admin', 'manager'],
      'orders.manage',
    );
    expect(mockCompOrder).toHaveBeenCalledWith(ORDER_ID, TENANT_ID, {
      reason: 'Geste commercial',
      compedBy: 'admin-9',
    });
    // A real comp transition is audited.
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update', entityType: 'order', entityId: ORDER_ID }),
    );
  });

  it('rejects a disallowed role (AuthError) and maps it to { error }', async () => {
    mockGetAuthUserForTenant.mockRejectedValue(new MockAuthError('Permissions insuffisantes'));

    const { actionCompOrder } = await import('@/app/actions/orders');
    const result = await actionCompOrder(TENANT_ID, ORDER_ID, 'x');

    expect(result.error).toBe('Permissions insuffisantes');
    expect(result.success).toBeUndefined();
    expect(mockCompOrder).not.toHaveBeenCalled();
  });

  it('does NOT audit an idempotent replay (comped=false)', async () => {
    mockCompOrder.mockResolvedValue({ summary: { paymentStatus: 'comp' }, comped: false });

    const { actionCompOrder } = await import('@/app/actions/orders');
    const result = await actionCompOrder(TENANT_ID, ORDER_ID, 'x');

    expect(result.success).toBe(true);
    expect(mockAuditLog).not.toHaveBeenCalled();
  });
});

/**
 * Coupure du restaurant sur les Server Actions.
 *
 * `OrderPaymentPanel` et `CompOrderDialog` appellent ces actions EN DIRECT,
 * sans passer par `/api/orders/mutations`: la coupure posee sur la route ne
 * les couvrait pas. Et le middleware ne refuse que `frozen`, `is_active =
 * false` et `suspended_at` - pour `cancelled`, la page admin se chargeait et
 * l'argent bougeait encore. Ces tests figent le refus et, surtout, que le
 * service d'encaissement n'est JAMAIS atteint.
 */
describe('actions d argent - coupure du restaurant', () => {
  const COUPES = ['frozen', 'cancelled', 'paused', 'unpaid', 'incomplete'] as const;

  function brancherTenant(statut: string) {
    mockGetAuthUserForTenant.mockResolvedValue({
      supabase: mockAuthedSupabase,
      user: { id: 'user-9', email: 'boss@resto.test' },
      adminUserId: 'admin-9',
    });
    mockAuthedSupabase.from.mockReturnValue(
      makeChain({
        data: {
          subscription_plan: 'business',
          subscription_status: statut,
          trial_ends_at: null,
          is_active: true,
          suspended_at: null,
        },
        error: null,
      }),
    );
  }

  beforeEach(() => vi.clearAllMocks());

  it.each(COUPES)('refuse d offrir une commande quand le restaurant est %s', async (statut) => {
    brancherTenant(statut);
    const { actionCompOrder } = await import('@/app/actions/orders');
    const result = await actionCompOrder(TENANT_ID, ORDER_ID, 'Geste commercial');

    expect(result.error).toBe('Ce restaurant est temporairement indisponible');
    expect(result.success).toBeUndefined();
    // Le point qui compte: l'argent n'a pas bouge.
    expect(mockCompOrder).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('refuse de changer le statut d une commande quand le restaurant est coupe', async () => {
    brancherTenant('cancelled');
    const { actionUpdateOrderStatus } = await import('@/app/actions/orders');
    const result = await actionUpdateOrderStatus(TENANT_ID, ORDER_ID, 'ready');

    expect(result.error).toBe('Ce restaurant est temporairement indisponible');
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it.each(['trial', 'past_due'] as const)(
    'laisse offrir une commande quand le restaurant est %s',
    async (statut) => {
      brancherTenant(statut);
      mockCompOrder.mockResolvedValue({ summary: { paymentStatus: 'comp' }, comped: true });
      const { actionCompOrder } = await import('@/app/actions/orders');
      const result = await actionCompOrder(TENANT_ID, ORDER_ID, 'Geste commercial');

      expect(result.success).toBe(true);
      expect(mockCompOrder).toHaveBeenCalled();
    },
  );
});
