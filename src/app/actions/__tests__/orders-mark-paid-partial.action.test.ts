import { describe, it, expect, vi, beforeEach } from 'vitest';

// Revue L011 (A2): encaisser depuis la caisse une commande `partial` (acompte
// deja pris) repondait `paid: false`, lu "deja reglee" par la caisse, sans
// jamais encaisser le solde. L'action doit encaisser le solde au registre.

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
vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserForTenant: vi.fn(async () => ({
    supabase: {},
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

const TENANT = '22222222-2222-4222-a222-222222222222';
const ORDER = '33333333-3333-4333-a333-333333333333';

describe('actionMarkOrderPaid: commande partiellement payee', () => {
  beforeEach(() => vi.clearAllMocks());

  it('partial: encaisse le solde restant au registre et repond paid', async () => {
    mockMarkPaid.mockResolvedValue({ paid: false });
    mockGetSummary.mockResolvedValue({ due: 10000, net: 4000, paymentStatus: 'partial' });
    mockRecordTender.mockResolvedValue({ paymentStatus: 'paid' });
    const res = await actionMarkOrderPaid(TENANT, ORDER, 'cash');
    expect(mockRecordTender).toHaveBeenCalledWith(ORDER, TENANT, {
      amount: 6000,
      method: 'cash',
      createdBy: 'admin-1',
    });
    expect(res).toEqual({ success: true, paid: true });
  });

  it('partial avec pourboire: refuse avec un message, rien n est encaisse', async () => {
    mockMarkPaid.mockResolvedValue({ paid: false });
    mockGetSummary.mockResolvedValue({ due: 10000, net: 4000, paymentStatus: 'partial' });
    const res = await actionMarkOrderPaid(TENANT, ORDER, 'cash', 500);
    expect(res.error).toMatch(/acompte/);
    expect(mockRecordTender).not.toHaveBeenCalled();
  });

  it('temoin: vraiment deja reglee, reste paid false sans second encaissement', async () => {
    mockMarkPaid.mockResolvedValue({ paid: false });
    mockGetSummary.mockResolvedValue({ due: 10000, net: 10000, paymentStatus: 'paid' });
    const res = await actionMarkOrderPaid(TENANT, ORDER, 'cash');
    expect(res).toEqual({ success: true, paid: false });
    expect(mockRecordTender).not.toHaveBeenCalled();
  });

  it('temoin: pending, le chemin rapide suffit, aucun calcul de solde', async () => {
    mockMarkPaid.mockResolvedValue({ paid: true });
    const res = await actionMarkOrderPaid(TENANT, ORDER, 'cash');
    expect(res).toEqual({ success: true, paid: true });
    expect(mockGetSummary).not.toHaveBeenCalled();
  });
});
