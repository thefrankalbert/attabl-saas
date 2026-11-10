import { describe, it, expect, vi, beforeEach } from 'vitest';

// Supprimer une note impayee revient a l'annuler: un geste d'argent. La base
// exige `orders.pay` pour supprimer une commande et ses articles; l'action doit
// refuser AVANT, sinon un admin a qui le proprietaire a retire l'argent
// recevait un succes alors que la RLS n'avait rien supprime.

vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserForTenant: vi.fn(),
  AuthError: class AuthError extends Error {},
}));
vi.mock('@/services/order.service', () => ({ createOrderService: vi.fn() }));
vi.mock('@/services/inventory.service', () => ({ createInventoryService: vi.fn() }));
vi.mock('@/services/payment.service', () => ({ createPaymentService: vi.fn() }));
vi.mock('@/services/order-annotation.service', () => ({ createOrderAnnotationService: vi.fn() }));
vi.mock('@/services/audit.service', () => ({ createAuditService: () => ({ log: vi.fn() }) }));

const { mockResolve, mockDelete } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockDelete: vi.fn(),
}));
vi.mock('@/lib/auth/resolve-admin-permission', () => ({ resolveAdminPermission: mockResolve }));

const TENANT_ID = '22222222-2222-4222-a222-222222222222';
const ORDER_ID = '33333333-3333-4333-a333-333333333333';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
    from: (table: string) => {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is', 'in']) c[m] = vi.fn(() => c);
      const rows =
        table === 'orders'
          ? [{ id: ORDER_ID, tenant_id: TENANT_ID, payment_status: 'pending' }]
          : [{ tenant_id: TENANT_ID, role: 'admin' }];
      c.then = (ok: (v: { data: unknown; error: null }) => unknown) =>
        ok({ data: rows, error: null });
      c.delete = vi.fn(() => {
        mockDelete(table);
        return { in: async () => ({ error: null }) };
      });
      return c;
    },
  })),
}));

import { actionDeleteOrders } from '@/app/actions/orders';

describe('actionDeleteOrders: supprimer exige orders.pay', () => {
  beforeEach(() => vi.clearAllMocks());

  it('admin sans orders.pay: refuse, rien n est supprime', async () => {
    mockResolve.mockResolvedValue({ allowed: false, role: 'admin' });
    const res = await actionDeleteOrders([ORDER_ID]);
    expect(res.error).toBeDefined();
    expect(mockResolve).toHaveBeenCalledWith(expect.anything(), 'u-1', TENANT_ID, 'orders.pay');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('admin avec orders.pay: supprime articles puis commande', async () => {
    mockResolve.mockResolvedValue({ allowed: true, role: 'admin' });
    const res = await actionDeleteOrders([ORDER_ID]);
    expect(res.success).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith('order_items');
    expect(mockDelete).toHaveBeenCalledWith('orders');
  });
});
