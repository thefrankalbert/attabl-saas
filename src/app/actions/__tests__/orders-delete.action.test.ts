import { describe, it, expect, vi, beforeEach } from 'vitest';

// Coupure du restaurant (A-02): la garde est simulee ici, sa logique est testee
// dans lib/billing/__tests__/assert-tenant-serving.test.ts.
const { mockAssertServing } = vi.hoisted(() => ({ mockAssertServing: vi.fn() }));
// actions/orders.ts reaches push.service (server-only) via order-ready.service.
vi.mock('server-only', () => ({}));
vi.mock('@/lib/billing/assert-tenant-serving', async () => {
  const { AuthError } = await import('@/lib/auth/get-session');
  class TenantLockedError extends AuthError {
    constructor(message = 'Ce restaurant est temporairement indisponible') {
      super(message, 403);
    }
  }
  return { assertTenantServing: mockAssertServing, TenantLockedError };
});

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
const { auditLog } = vi.hoisted(() => ({ auditLog: vi.fn() }));
vi.mock('@/services/audit.service', () => ({ createAuditService: () => ({ log: auditLog }) }));

const { mockResolve, mockDelete, ledger } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockDelete: vi.fn(),
  ledger: {
    rows: [] as Array<{ order_id: string }>,
    status: 'pending',
    // Nombre de commandes que la base supprime vraiment (`count`).
    deletedCount: 1 as number | null,
    // La relecture qui suit une suppression incomplete echoue.
    rereadFails: false,
    ordersReads: 0,
  },
}));
vi.mock('@/lib/auth/resolve-admin-permission', () => ({ resolveAdminPermission: mockResolve }));

const TENANT_ID = '22222222-2222-4222-a222-222222222222';
const ORDER_ID = '33333333-3333-4333-a333-333333333333';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
    from: (table: string) => {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is', 'in', 'limit']) c[m] = vi.fn(() => c);
      const rows =
        table === 'orders'
          ? [{ id: ORDER_ID, tenant_id: TENANT_ID, payment_status: ledger.status }]
          : table === 'payments'
            ? ledger.rows
            : [{ tenant_id: TENANT_ID, role: 'admin' }];
      c.then = (ok: (v: { data: unknown; error: unknown }) => unknown) => {
        if (table === 'orders' && ++ledger.ordersReads > 1 && ledger.rereadFails) {
          return ok({ data: null, error: { message: 'timeout' } });
        }
        return ok({ data: rows, error: null });
      };
      c.delete = vi.fn((opts?: unknown) => {
        mockDelete(table, opts);
        return { in: async () => ({ error: null, count: ledger.deletedCount }) };
      });
      return c;
    },
  })),
}));

import { actionDeleteOrders } from '@/app/actions/orders';
import { TenantLockedError } from '@/lib/billing/assert-tenant-serving';

describe('actionDeleteOrders: supprimer exige orders.pay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ledger.rows = [];
    ledger.status = 'pending';
    ledger.deletedCount = 1;
    ledger.rereadFails = false;
    ledger.ordersReads = 0;
  });

  it('admin sans orders.pay: refuse, rien n est supprime', async () => {
    mockResolve.mockResolvedValue({ allowed: false, role: 'admin' });
    const res = await actionDeleteOrders([ORDER_ID]);
    expect(res.error).toBeDefined();
    expect(mockResolve).toHaveBeenCalledWith(expect.anything(), 'u-1', TENANT_ID, 'orders.pay');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('admin avec orders.pay: supprime la commande (articles en cascade), compte exige', async () => {
    mockResolve.mockResolvedValue({ allowed: true, role: 'admin' });
    const res = await actionDeleteOrders([ORDER_ID]);
    expect(res.success).toBe(true);
    expect(res.deletedCount).toBe(1);
    expect(mockDelete).toHaveBeenCalledWith('orders', { count: 'exact' });
    // Plus de suppression des articles AVANT la commande: si la base refusait
    // la commande, elle restait sans ses articles.
    expect(mockDelete).not.toHaveBeenCalledWith('order_items', expect.anything());
  });

  // Second contre-audit: un paiement arrive entre la verification du registre
  // et la suppression. La politique DELETE refuse la commande sans erreur
  // (0 ligne): l'action doit le dire au lieu d'annoncer "supprimee".
  it('la base refuse la suppression (0 ligne): erreur honnete, pas de succes', async () => {
    mockResolve.mockResolvedValue({ allowed: true, role: 'owner' });
    ledger.deletedCount = 0;
    const res = await actionDeleteOrders([ORDER_ID]);
    expect(res.success).toBeUndefined();
    expect(res.deletedCount).toBe(0);
    expect(res.error).toMatch(/n'ont pas ete supprimees/);
  });

  it('restaurant coupe: refuse avec le message de coupure, rien n est supprime', async () => {
    mockResolve.mockResolvedValue({ allowed: true, role: 'admin' });
    mockAssertServing.mockRejectedValueOnce(new TenantLockedError());
    const res = await actionDeleteOrders([ORDER_ID]);
    expect(res.error).toBe('Ce restaurant est temporairement indisponible');
    expect(res.success).toBeUndefined();
    expect(mockAssertServing).toHaveBeenCalledWith(TENANT_ID);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('commande partial avec un acompte au registre: refusee, rien n est supprime', async () => {
    mockResolve.mockResolvedValue({ allowed: true, role: 'owner' });
    ledger.status = 'partial';
    ledger.rows = [{ order_id: ORDER_ID }];
    const res = await actionDeleteOrders([ORDER_ID]);
    expect(res.success).toBeUndefined();
    // Message exact meme pour une commande deja annulee et remboursee: il ne
    // renvoie pas vers un geste impossible (contre-audit du lot A).
    expect(res.error).toBe('Cette commande a recu des paiements, elle ne peut pas etre supprimee.');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  // Troisieme contre-audit: si la relecture apres une suppression incomplete
  // echoue, rien d'incertain n'est journalise et l'action ne repond pas succes.
  it('suppression incomplete et relecture en echec: erreur, aucun journal', async () => {
    mockResolve.mockResolvedValue({ allowed: true, role: 'owner' });
    ledger.deletedCount = 0;
    ledger.rereadFails = true;
    const res = await actionDeleteOrders([ORDER_ID]);
    expect(res.success).toBeUndefined();
    expect(res.error).toMatch(/Rechargez la page/);
    expect(auditLog).not.toHaveBeenCalled();
  });
});
