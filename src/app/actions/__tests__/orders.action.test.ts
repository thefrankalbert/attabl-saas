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
// La coupure du restaurant (assertTenantServing) lit en service_role, parce que
// `stripe_subscription_id` est illisible pour `authenticated`: le client admin
// rend donc la meme ligne de restaurant que le client authentifie.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => mockAuthedSupabase) }));

const mockCancelOrder = vi.fn();
const mockUpdateStatus = vi.fn();
const mockSetCourseHeld = vi.fn();
vi.mock('@/services/order.service', () => ({
  createOrderService: vi.fn(() => ({
    cancelOrder: mockCancelOrder,
    updateStatus: mockUpdateStatus,
    setCourseHeld: mockSetCourseHeld,
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
    // ET le droit d'encaisser (orders.pay), que le proprietaire peut retirer.
    expect(mockGetAuthUserForTenant).toHaveBeenCalledWith(
      TENANT_ID,
      ['owner', 'admin', 'manager'],
      ['orders.manage', 'orders.pay'],
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

/**
 * Decision produit du 2026-11-09: a la fin d'un essai sans abonnement (pas
 * encore gele par le cron), la cuisine FINIT les commandes creees avant
 * `trial_ends_at`. Ni encaissement, ni commande creee apres la fin d'essai.
 */
describe("actions de cuisine - fin d'essai", () => {
  const FIN_ESSAI = '2020-01-10T10:00:00Z';
  const ITEM_ID = '44444444-4444-4444-a444-444444444444';

  function brancherEssaiExpire(commandeCreeeLe: string, etat: Record<string, unknown> = {}) {
    mockGetAuthUserForTenant.mockResolvedValue({
      supabase: mockAuthedSupabase,
      user: { id: 'user-9', email: 'chef@resto.test' },
      adminUserId: 'admin-9',
    });
    const chaine = (resolved: unknown) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is', 'in', 'update']) chain[m] = vi.fn(() => chain);
      chain.maybeSingle = vi.fn().mockResolvedValue(resolved);
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ error: null });
      return chain;
    };
    mockAuthedSupabase.from.mockImplementation(((table: string) => {
      if (table === 'tenants') {
        return chaine({
          data: {
            subscription_plan: 'starter',
            subscription_status: 'trial',
            trial_ends_at: FIN_ESSAI,
            stripe_subscription_id: null,
            is_active: true,
            suspended_at: null,
            ...etat,
          },
          error: null,
        });
      }
      return chaine({ data: { id: ORDER_ID, created_at: commandeCreeeLe }, error: null });
    }) as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateStatus.mockResolvedValue(undefined);
    mockCancelOrder.mockResolvedValue(undefined);
    mockSetCourseHeld.mockResolvedValue(undefined);
    afterCallbacks.length = 0;
  });

  it('commande d avant la fin: la cuisine la fait avancer', async () => {
    brancherEssaiExpire('2020-01-10T09:00:00Z');
    const { actionUpdateOrderStatus } = await import('@/app/actions/orders');
    const result = await actionUpdateOrderStatus(TENANT_ID, ORDER_ID, 'ready');

    expect(result).toEqual({ success: true });
    expect(mockUpdateStatus).toHaveBeenCalledWith(ORDER_ID, TENANT_ID, 'ready');
  });

  it('commande d avant la fin: la cuisine peut l annuler, et le stock revient', async () => {
    // Le plan stocke (starter) n'a pas le module stock, mais la commande a ete
    // destockee pendant l'essai: sans restockage, le stock resterait faux.
    vi.mocked(canAccessFeature).mockReturnValue(false);
    mockRestockOrder.mockResolvedValue(1);
    brancherEssaiExpire('2020-01-10T09:00:00Z');
    const { actionUpdateOrderStatus } = await import('@/app/actions/orders');
    const result = await actionUpdateOrderStatus(TENANT_ID, ORDER_ID, 'cancelled');

    expect(result).toEqual({ success: true });
    expect(mockCancelOrder).toHaveBeenCalledWith(ORDER_ID, TENANT_ID);
    await runScheduled();
    expect(mockRestockOrder).toHaveBeenCalledWith(ORDER_ID, TENANT_ID, 'user-9');
  });

  it('commande d avant la fin: articles et plats tenus aussi', async () => {
    brancherEssaiExpire('2020-01-10T09:00:00Z');
    const { actionUpdateItemStatus, actionSetCourseHeld } = await import('@/app/actions/orders');

    await expect(actionUpdateItemStatus(TENANT_ID, ORDER_ID, [ITEM_ID], 'ready')).resolves.toEqual({
      success: true,
    });
    await expect(actionSetCourseHeld(TENANT_ID, ORDER_ID, 'main', false)).resolves.toEqual({
      success: true,
    });
    expect(mockSetCourseHeld).toHaveBeenCalled();
  });

  it('commande creee apres la fin: refusee', async () => {
    brancherEssaiExpire('2020-01-10T10:30:00Z');
    const { actionUpdateOrderStatus, actionUpdateItemStatus, actionSetCourseHeld } =
      await import('@/app/actions/orders');

    const result = await actionUpdateOrderStatus(TENANT_ID, ORDER_ID, 'ready');
    expect(result.error).toBe('Ce restaurant est temporairement indisponible');
    expect(mockUpdateStatus).not.toHaveBeenCalled();

    const item = await actionUpdateItemStatus(TENANT_ID, ORDER_ID, [ITEM_ID], 'ready');
    expect(item.error).toBe('Ce restaurant est temporairement indisponible');

    const held = await actionSetCourseHeld(TENANT_ID, ORDER_ID, 'main', false);
    expect(held.error).toBe('Ce restaurant est temporairement indisponible');
    expect(mockSetCourseHeld).not.toHaveBeenCalled();
  });

  it('suspendu par le super-admin: aucune exception, meme pour une commande d avant', async () => {
    brancherEssaiExpire('2020-01-10T09:00:00Z', { suspended_at: '2020-01-10T11:00:00Z' });
    const { actionUpdateOrderStatus } = await import('@/app/actions/orders');
    const result = await actionUpdateOrderStatus(TENANT_ID, ORDER_ID, 'ready');

    expect(result.error).toBe('Ce restaurant est temporairement indisponible');
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it('l encaissement reste refuse, meme pour une commande d avant', async () => {
    brancherEssaiExpire('2020-01-10T09:00:00Z');
    const { actionCompOrder } = await import('@/app/actions/orders');
    const result = await actionCompOrder(TENANT_ID, ORDER_ID, 'Geste commercial');

    expect(result.error).toBe('Ce restaurant est temporairement indisponible');
    expect(mockCompOrder).not.toHaveBeenCalled();
  });
});
