import { describe, it, expect, vi, beforeEach } from 'vitest';

// Revue L011 (A2): encaisser depuis la caisse une commande `partial` (acompte
// deja pris) repondait `paid: false`, lu "deja reglee" par la caisse, sans
// jamais encaisser le solde. L'action doit encaisser le solde au registre, et
// ce SANS appeler markPaid: selon sa version (PR #446), markPaid repond
// "deja reglee" ou leve une erreur VALIDATION sur une commande `partial`.

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/auth/resolve-admin-permission', () => ({ resolveAdminPermission: vi.fn() }));
vi.mock('@/lib/billing/assert-tenant-serving', () => ({
  assertTenantServing: vi.fn(),
  assertTenantServingForKitchen: vi.fn(),
  TenantLockedError: class TenantLockedError extends Error {},
}));
const { orderRow, eqCalls } = vi.hoisted(() => ({
  orderRow: { value: { payment_status: 'pending' } as { payment_status: string } | null },
  eqCalls: [] as Array<[string, string, unknown]>,
}));
/**
 * Lecture du statut de paiement: `.from('orders').select().eq().eq().maybeSingle()`.
 * Chaque `eq` est enregistre: le filtre `tenant_id` doit etre prouve, pas suppose.
 */
const supabase = {
  from: (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (col: string, val: unknown) => {
      eqCalls.push([table, col, val]);
      return chain;
    };
    chain.maybeSingle = async () => ({ data: orderRow.value, error: null });
    return chain;
  },
};
vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserForTenant: vi.fn(async () => ({
    supabase,
    user: { id: 'u-1' },
    adminUserId: 'admin-1',
  })),
  AuthError: class AuthError extends Error {},
}));
vi.mock('@/lib/plans/assert-feature', () => ({ isFeatureEntitled: vi.fn(async () => true) }));
vi.mock('@/services/inventory.service', () => ({ createInventoryService: vi.fn() }));
vi.mock('@/services/order-annotation.service', () => ({ createOrderAnnotationService: vi.fn() }));
vi.mock('@/services/order-ready.service', () => ({ createOrderReadyService: vi.fn() }));
vi.mock('@/services/audit.service', () => ({ createAuditService: () => ({ log: vi.fn() }) }));

const { mockMarkPaid, mockGetSummary, mockRecordTender } = vi.hoisted(() => ({
  mockMarkPaid: vi.fn(),
  mockGetSummary: vi.fn(),
  mockRecordTender: vi.fn(),
}));
vi.mock('@/services/order.service', () => ({
  createOrderService: () => ({ markPaid: mockMarkPaid }),
}));
vi.mock('@/services/payment.service', () => ({
  createPaymentService: () => ({ getSummary: mockGetSummary, recordTender: mockRecordTender }),
}));

import { actionMarkOrderPaid } from '@/app/actions/orders';
import { ServiceError } from '@/services/errors';

const TENANT = '22222222-2222-4222-a222-222222222222';
const ORDER = '33333333-3333-4333-a333-333333333333';

describe('actionMarkOrderPaid: commande partiellement payee', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eqCalls.length = 0;
    orderRow.value = { payment_status: 'pending' };
    // Version #446 de markPaid: elle LEVE sur une commande `partial`. Si
    // l'action l'appelait, ce test le verrait.
    mockMarkPaid.mockRejectedValue(
      new ServiceError('Encaissez le reste depuis le detail de la commande.', 'VALIDATION'),
    );
  });

  it('partial: encaisse le solde restant au registre, sans appeler markPaid', async () => {
    orderRow.value = { payment_status: 'partial' };
    mockGetSummary.mockResolvedValue({ due: 10000, net: 4000, paymentStatus: 'partial' });
    mockRecordTender.mockResolvedValue({ paymentStatus: 'paid' });
    const res = await actionMarkOrderPaid(TENANT, ORDER, 'cash');
    expect(mockRecordTender).toHaveBeenCalledWith(ORDER, TENANT, {
      amount: 6000,
      method: 'cash',
      createdBy: 'admin-1',
    });
    expect(res).toEqual({ success: true, paid: true });
    expect(mockMarkPaid).not.toHaveBeenCalled();
    // La lecture prealable est bornee au restaurant de la session.
    expect(eqCalls).toContainEqual(['orders', 'tenant_id', TENANT]);
    expect(eqCalls).toContainEqual(['orders', 'id', ORDER]);
  });

  it('course entre deux caisses: l autre a solde, repond deja reglee au lieu d une erreur', async () => {
    orderRow.value = { payment_status: 'partial' };
    mockGetSummary
      .mockResolvedValueOnce({ due: 10000, net: 4000, paymentStatus: 'partial' })
      .mockResolvedValueOnce({ due: 10000, net: 10000, paymentStatus: 'paid' });
    mockRecordTender.mockRejectedValue(
      new ServiceError('Montant superieur au solde du', 'VALIDATION'),
    );
    const res = await actionMarkOrderPaid(TENANT, ORDER, 'cash');
    expect(res).toEqual({ success: true, paid: false });
  });

  it('temoin: refus sans course (solde toujours du apres relecture): l erreur reste', async () => {
    orderRow.value = { payment_status: 'partial' };
    mockGetSummary.mockResolvedValue({ due: 10000, net: 4000, paymentStatus: 'partial' });
    mockRecordTender.mockRejectedValue(
      new ServiceError('Montant superieur au solde du', 'VALIDATION'),
    );
    const res = await actionMarkOrderPaid(TENANT, ORDER, 'cash');
    expect(res.error).toBe('Montant superieur au solde du');
  });

  it('partial avec pourboire: refuse avec un message, rien n est encaisse', async () => {
    orderRow.value = { payment_status: 'partial' };
    mockGetSummary.mockResolvedValue({ due: 10000, net: 4000, paymentStatus: 'partial' });
    const res = await actionMarkOrderPaid(TENANT, ORDER, 'cash', 500);
    expect(res.error).toMatch(/acompte/);
    expect(mockRecordTender).not.toHaveBeenCalled();
    expect(mockMarkPaid).not.toHaveBeenCalled();
  });

  it('partial rejouee apres un solde deja encaisse: paid false, pas de second encaissement', async () => {
    orderRow.value = { payment_status: 'partial' };
    mockGetSummary.mockResolvedValue({ due: 10000, net: 10000, paymentStatus: 'paid' });
    const res = await actionMarkOrderPaid(TENANT, ORDER, 'cash');
    expect(res).toEqual({ success: true, paid: false });
    expect(mockRecordTender).not.toHaveBeenCalled();
    expect(mockMarkPaid).not.toHaveBeenCalled();
  });

  it('temoin: deja payee, le chemin rapide repond paid false sans calcul de solde', async () => {
    orderRow.value = { payment_status: 'paid' };
    mockMarkPaid.mockResolvedValue({ paid: false });
    const res = await actionMarkOrderPaid(TENANT, ORDER, 'cash');
    expect(res).toEqual({ success: true, paid: false });
    expect(mockGetSummary).not.toHaveBeenCalled();
    expect(mockRecordTender).not.toHaveBeenCalled();
  });

  it('temoin: pending, le chemin rapide suffit, aucun calcul de solde', async () => {
    orderRow.value = { payment_status: 'pending' };
    mockMarkPaid.mockResolvedValue({ paid: true });
    const res = await actionMarkOrderPaid(TENANT, ORDER, 'cash');
    expect(res).toEqual({ success: true, paid: true });
    expect(mockGetSummary).not.toHaveBeenCalled();
  });
});
