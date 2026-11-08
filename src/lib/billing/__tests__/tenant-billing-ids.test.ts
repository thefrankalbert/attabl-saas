import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Pourquoi ces tests. Le role `authenticated` ne lit plus les identifiants
 * Stripe de `tenants`: ils passent par ce helper, en service_role. Deux
 * proprietes a figer:
 *   1. la lecture est filtree sur le restaurant demande, et seulement les deux
 *      colonnes Stripe;
 *   2. une panne de lecture est LEVEE, jamais convertie en "aucun abonnement"
 *      (ce qui pousserait a ouvrir un second abonnement).
 */

const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
let reponse: { data: unknown; error: { message: string } | null };

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { getTenantBillingIds } from '../tenant-billing-ids';

beforeEach(() => {
  vi.clearAllMocks();
  reponse = { data: null, error: null };
  mockFrom.mockReturnValue({ select: mockSelect });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ maybeSingle: () => Promise.resolve(reponse) });
});

describe('getTenantBillingIds', () => {
  it('lit les deux colonnes Stripe du restaurant demande, et lui seul', async () => {
    reponse = {
      data: { stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1' },
      error: null,
    };

    await expect(getTenantBillingIds('tenant-1')).resolves.toEqual({
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
    });
    expect(mockFrom).toHaveBeenCalledWith('tenants');
    expect(mockSelect).toHaveBeenCalledWith('stripe_customer_id, stripe_subscription_id');
    expect(mockEq).toHaveBeenCalledWith('id', 'tenant-1');
  });

  it('rend null quand le restaurant est introuvable', async () => {
    await expect(getTenantBillingIds('absent')).resolves.toBeNull();
  });

  it('leve une erreur sur une panne de lecture', async () => {
    reponse = { data: null, error: { message: 'boom' } };

    await expect(getTenantBillingIds('tenant-1')).rejects.toThrow('boom');
  });
});
