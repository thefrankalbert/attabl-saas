import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Audit des offres 2026-11-20: les pourboires sont vendus a partir de Pro. Un
 * pourboire ajoute a l'encaissement passe par actionMarkOrderPaid, pas par la
 * route de commande: la garde de plan y existait, sans aucun test.
 */

vi.mock('server-only', () => ({}));
vi.mock('next/server', async (importActual) => ({
  ...(await importActual<typeof import('next/server')>()),
  after: () => {},
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock('@/lib/auth/get-session', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/auth/get-session')>()),
  // L'action lit le statut de paiement avant d'encaisser:
  // `.from('orders').select().eq().eq().maybeSingle()`. Commande en attente ici.
  getAuthenticatedUserForTenant: vi.fn(async () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: { payment_status: 'pending' }, error: null }),
    };
    return { supabase: { from: () => chain } };
  }),
}));
vi.mock('@/lib/billing/assert-tenant-serving', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/billing/assert-tenant-serving')>()),
  assertTenantServing: vi.fn(async () => undefined),
}));

const mockEntitled = vi.fn();
vi.mock('@/lib/plans/assert-feature', () => ({
  isFeatureEntitled: (...a: unknown[]) => mockEntitled(...a),
}));

const mockMarkPaid = vi.fn();
vi.mock('@/services/order.service', () => ({
  createOrderService: vi.fn(() => ({ markPaid: mockMarkPaid })),
}));

import { actionMarkOrderPaid } from '../orders';

const TENANT = '22222222-2222-4222-a222-222222222222';
const ORDER = '33333333-3333-4333-a333-333333333333';

beforeEach(() => {
  vi.clearAllMocks();
  mockMarkPaid.mockResolvedValue({ paid: true });
});

describe('actionMarkOrderPaid - pourboire et plan', () => {
  it('refuse un pourboire si le plan ne l inclut pas', async () => {
    mockEntitled.mockResolvedValue(false);
    const res = await actionMarkOrderPaid(TENANT, ORDER, 'cash', 500);
    expect(res.error).toMatch(/pourboires ne sont pas inclus/);
    expect(mockEntitled).toHaveBeenCalledWith(expect.anything(), TENANT, 'canAccessTips');
    expect(mockMarkPaid).not.toHaveBeenCalled();
  });

  it('encaisse sans pourboire sur tous les plans', async () => {
    mockEntitled.mockResolvedValue(false);
    const res = await actionMarkOrderPaid(TENANT, ORDER, 'cash');
    expect(res.success).toBe(true);
    expect(mockMarkPaid).toHaveBeenCalled();
  });

  it('accepte le pourboire quand le plan l inclut', async () => {
    mockEntitled.mockResolvedValue(true);
    const res = await actionMarkOrderPaid(TENANT, ORDER, 'cash', 500);
    expect(res.success).toBe(true);
  });
});
