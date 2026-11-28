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
// exige l'autorite d'argent (MONEY_PERMISSIONS, les quatre droits ensemble)
// pour supprimer une commande et ses articles; l'action doit refuser AVANT,
// sinon un membre refuse par la base recevait un succes alors que la RLS
// n'avait rien supprime. La vraie resolution des droits tourne ici : seul le
// client Supabase est simule (ligne de membre et reglages des postes).

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

const { mockDelete, ledger } = vi.hoisted(() => ({
  mockDelete: vi.fn(),
  ledger: {
    // Ligne `admin_users` de l'appelant (postes + reglage par personne).
    member: { postes: ['manager'], permission_overrides: null } as {
      postes: string[];
      permission_overrides: Record<string, boolean> | null;
    },
    rows: [] as Array<{ order_id: string }>,
    status: 'pending',
    // Nombre de commandes que la base supprime vraiment (`count`).
    deletedCount: 1 as number | null,
    // La relecture qui suit une suppression incomplete echoue.
    rereadFails: false,
    ordersReads: 0,
  },
}));

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
            : [];
      c.then = (ok: (v: { data: unknown; error: unknown }) => unknown) => {
        if (table === 'orders' && ++ledger.ordersReads > 1 && ledger.rereadFails) {
          return ok({ data: null, error: { message: 'timeout' } });
        }
        return ok({ data: rows, error: null });
      };
      c.maybeSingle = vi.fn(async () => ({
        data:
          table === 'admin_users'
            ? {
                id: 'admin-1',
                postes: ledger.member.postes,
                permission_overrides: ledger.member.permission_overrides,
                is_super_admin: false,
                role: null,
              }
            : null,
        error: null,
      }));
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

describe('actionDeleteOrders: supprimer exige l autorite d argent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ledger.member = { postes: ['manager'], permission_overrides: null };
    ledger.rows = [];
    ledger.status = 'pending';
    ledger.deletedCount = 1;
    ledger.rereadFails = false;
    ledger.ordersReads = 0;
  });

  it('gerant (poste manager): supprime la commande (articles en cascade), compte exige', async () => {
    const res = await actionDeleteOrders([ORDER_ID]);
    expect(res.success).toBe(true);
    expect(res.deletedCount).toBe(1);
    expect(mockDelete).toHaveBeenCalledWith('orders', { count: 'exact' });
    // Plus de suppression des articles AVANT la commande: si la base refusait
    // la commande, elle restait sans ses articles.
    expect(mockDelete).not.toHaveBeenCalledWith('order_items', expect.anything());
  });

  it('caissier par defaut: refuse, rien n est supprime (temoin: le gerant passe)', async () => {
    ledger.member = { postes: ['cashier'], permission_overrides: null };
    const res = await actionDeleteOrders([ORDER_ID]);
    expect(res.error).toMatch(/autorite d'argent/);
    expect(res.success).toBeUndefined();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  // Caissier : orders.pay en entier, les trois autres limited. Un seul des
  // trois droits manquants ne suffit pas, il faut les quatre ensemble.
  it.each(['orders.refund', 'orders.cancel', 'orders.discount'])(
    'caissier avec %s seul en plus: refuse, rien n est supprime',
    async (code) => {
      ledger.member = { postes: ['cashier'], permission_overrides: { [code]: true } };
      const res = await actionDeleteOrders([ORDER_ID]);
      expect(res.error).toMatch(/autorite d'argent/);
      expect(mockDelete).not.toHaveBeenCalled();
    },
  );

  it('caissier avec les quatre droits: supprime (meme requete que les cas refuses)', async () => {
    ledger.member = {
      postes: ['cashier'],
      permission_overrides: {
        'orders.pay': true,
        'orders.refund': true,
        'orders.cancel': true,
        'orders.discount': true,
      },
    };
    const res = await actionDeleteOrders([ORDER_ID]);
    expect(res.success).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith('orders', { count: 'exact' });
  });

  it('gerant a qui le proprietaire retire orders.refund: refuse', async () => {
    ledger.member = { postes: ['manager'], permission_overrides: { 'orders.refund': false } };
    const res = await actionDeleteOrders([ORDER_ID]);
    expect(res.error).toMatch(/autorite d'argent/);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  // Second contre-audit: un paiement arrive entre la verification du registre
  // et la suppression. La politique DELETE refuse la commande sans erreur
  // (0 ligne): l'action doit le dire au lieu d'annoncer "supprimee".
  it('la base refuse la suppression (0 ligne): erreur honnete, pas de succes', async () => {
    ledger.deletedCount = 0;
    const res = await actionDeleteOrders([ORDER_ID]);
    expect(res.success).toBeUndefined();
    expect(res.deletedCount).toBe(0);
    expect(res.error).toMatch(/n'ont pas ete supprimees/);
  });

  it('restaurant coupe: refuse avec le message de coupure, rien n est supprime', async () => {
    mockAssertServing.mockRejectedValueOnce(new TenantLockedError());
    const res = await actionDeleteOrders([ORDER_ID]);
    expect(res.error).toBe('Ce restaurant est temporairement indisponible');
    expect(res.success).toBeUndefined();
    expect(mockAssertServing).toHaveBeenCalledWith(TENANT_ID);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('commande partial avec un acompte au registre: refusee, rien n est supprime', async () => {
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
    ledger.deletedCount = 0;
    ledger.rereadFails = true;
    const res = await actionDeleteOrders([ORDER_ID]);
    expect(res.success).toBeUndefined();
    expect(res.error).toMatch(/Rechargez la page/);
    expect(auditLog).not.toHaveBeenCalled();
  });
});
