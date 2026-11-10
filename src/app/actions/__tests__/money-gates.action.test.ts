import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Decision du proprietaire (2026-11-09):
 *   - le serveur prend les commandes et les fait avancer, sans toucher a l'argent;
 *   - le chef garde la cuisine, sans toucher a l'argent;
 *   - le caissier encaisse.
 *
 * Mesure avant correction: un chef avait enregistre un paiement par
 * `/api/orders/mutations` type 'pay' (actionMarkOrderPaid ne demandait que
 * `orders.manage`, que le chef detient), et pouvait mettre une note sur une
 * ardoise ou annuler une commande impayee.
 *
 * Ces tests passent par la VRAIE resolution de permissions
 * (getAuthenticatedUserForTenant -> hasPermission -> DEFAULT_PERMISSIONS):
 * seul le client Supabase est simule. Un test qui simulerait la garde elle-meme
 * ne pourrait que confirmer ce qu'on lui dit.
 */

vi.mock('next/server', async (importActual) => ({
  ...(await importActual<typeof import('next/server')>()),
  after: () => {},
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const TENANT_ID = '22222222-2222-4222-a222-222222222222';
const ORDER_ID = '33333333-3333-4333-a333-333333333333';
const ACCOUNT_ID = '44444444-4444-4444-a444-444444444444';

// Membre courant: role et surcharges, modifiables par test.
const member: { role: string; custom: Record<string, boolean> | null } = {
  role: 'chef',
  custom: null,
};

function chain(table: string) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'neq', 'order', 'limit']) c[m] = vi.fn(() => c);
  const row =
    table === 'admin_users'
      ? {
          id: 'admin-1',
          tenant_id: TENANT_ID,
          role: member.role,
          custom_permissions: member.custom,
        }
      : table === 'tenants'
        ? {
            subscription_plan: 'business',
            subscription_status: 'active',
            trial_ends_at: null,
            is_active: true,
            suspended_at: null,
          }
        : null;
  c.single = vi.fn(async () => ({ data: row, error: row ? null : { message: 'none' } }));
  c.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  return c;
}

const fakeSupabase = {
  auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u-1', email: 'x@y.z' } } })) },
  from: vi.fn((table: string) => chain(table)),
};
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fakeSupabase) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fakeSupabase) }));

const mockMarkPaid = vi.fn();
const mockCancelOrder = vi.fn();
const mockUpdateStatus = vi.fn();
vi.mock('@/services/order.service', () => ({
  createOrderService: vi.fn(() => ({
    markPaid: mockMarkPaid,
    cancelOrder: mockCancelOrder,
    updateStatus: mockUpdateStatus,
  })),
}));

const mockRecordTender = vi.fn();
const mockGetSummary = vi.fn();
vi.mock('@/services/payment.service', () => ({
  createPaymentService: vi.fn(() => ({
    recordTender: mockRecordTender,
    getSummary: mockGetSummary,
  })),
}));

const mockAttach = vi.fn();
vi.mock('@/services/order-annotation.service', () => ({
  createOrderAnnotationService: vi.fn(() => ({ attachOrderToHouseAccount: mockAttach })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  member.role = 'chef';
  member.custom = null;
  mockMarkPaid.mockResolvedValue({ paid: true });
  mockRecordTender.mockResolvedValue({ paymentStatus: 'paid', net: 100, due: 0 });
  mockGetSummary.mockResolvedValue({ paymentStatus: 'pending', due: 100, net: 0 });
});

describe('argent: chef et serveur refuses, caissier accepte', () => {
  it.each(['chef', 'waiter'])('%s ne marque PAS une commande payee', async (role) => {
    member.role = role;
    const { actionMarkOrderPaid } = await import('@/app/actions/orders');
    const res = await actionMarkOrderPaid(TENANT_ID, ORDER_ID, 'cash');
    expect(res.error).toBe('Permissions insuffisantes');
    expect(mockMarkPaid).not.toHaveBeenCalled();
  });

  it('le caissier marque une commande payee', async () => {
    member.role = 'cashier';
    const { actionMarkOrderPaid } = await import('@/app/actions/orders');
    const res = await actionMarkOrderPaid(TENANT_ID, ORDER_ID, 'cash');
    expect(res.success).toBe(true);
    expect(mockMarkPaid).toHaveBeenCalled();
  });

  it.each(['chef', 'waiter'])('%s n inscrit PAS de tender', async (role) => {
    member.role = role;
    const { actionRecordTender } = await import('@/app/actions/orders');
    const res = await actionRecordTender(TENANT_ID, ORDER_ID, 100, 'cash');
    expect(res.error).toBe('Permissions insuffisantes');
    expect(mockRecordTender).not.toHaveBeenCalled();
  });

  it('le caissier inscrit un tender', async () => {
    member.role = 'cashier';
    const { actionRecordTender } = await import('@/app/actions/orders');
    const res = await actionRecordTender(TENANT_ID, ORDER_ID, 100, 'cash');
    expect(res.success).toBe(true);
  });

  it.each(['chef', 'waiter'])('%s ne met PAS une note sur une ardoise', async (role) => {
    member.role = role;
    const { actionAttachOrderToHouseAccount } = await import('@/app/actions/house-accounts');
    const res = await actionAttachOrderToHouseAccount(TENANT_ID, ORDER_ID, ACCOUNT_ID);
    expect(res.error).toBe('Permissions insuffisantes');
    expect(mockAttach).not.toHaveBeenCalled();
  });

  it('le proprietaire peut retirer orders.pay a un caissier, et la garde le suit', async () => {
    member.role = 'cashier';
    member.custom = { 'orders.pay': false };
    const { actionMarkOrderPaid } = await import('@/app/actions/orders');
    const res = await actionMarkOrderPaid(TENANT_ID, ORDER_ID, 'cash');
    expect(res.error).toBe('Permissions insuffisantes');
  });
});

describe('statut: avancer oui, annuler non, pour le serveur et le chef', () => {
  it.each(['waiter', 'chef'])('%s fait avancer une commande (servie)', async (role) => {
    member.role = role;
    const { actionUpdateOrderStatus } = await import('@/app/actions/orders');
    const res = await actionUpdateOrderStatus(TENANT_ID, ORDER_ID, 'delivered');
    expect(res.success).toBe(true);
    expect(mockUpdateStatus).toHaveBeenCalledWith(ORDER_ID, TENANT_ID, 'delivered');
  });

  it.each(['waiter', 'chef'])('%s n annule PAS une commande (note impayee)', async (role) => {
    member.role = role;
    const { actionUpdateOrderStatus } = await import('@/app/actions/orders');
    const res = await actionUpdateOrderStatus(TENANT_ID, ORDER_ID, 'cancelled');
    expect(res.error).toBe('Permissions insuffisantes');
    expect(mockCancelOrder).not.toHaveBeenCalled();
  });

  it('le caissier annule une commande', async () => {
    member.role = 'cashier';
    const { actionUpdateOrderStatus } = await import('@/app/actions/orders');
    const res = await actionUpdateOrderStatus(TENANT_ID, ORDER_ID, 'cancelled');
    expect(res.success).toBe(true);
    expect(mockCancelOrder).toHaveBeenCalled();
  });
});

describe('lecture du reglement: orders.view suffit', () => {
  it('un serveur sans orders.manage lit le detail de paiement', async () => {
    member.role = 'waiter';
    member.custom = { 'orders.manage': false };
    const { actionGetPaymentSummary } = await import('@/app/actions/orders');
    const res = await actionGetPaymentSummary(TENANT_ID, ORDER_ID);
    expect(res.error).toBeUndefined();
    expect(res.summary).toBeDefined();
  });
});
