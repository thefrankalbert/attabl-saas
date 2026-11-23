import { beforeEach, describe, expect, it, vi } from 'vitest';

// Revue L012 (A6): un UPDATE refuse par la RLS ne leve aucune erreur. L'action
// annoncait "enregistre" alors que rien n'avait ete ecrit.

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/billing/assert-tenant-serving', () => ({
  assertTenantServing: vi.fn(),
  TenantLockedError: class TenantLockedError extends Error {},
}));

const { updateResult } = vi.hoisted(() => ({
  updateResult: { value: { error: null as unknown, count: 1 as number | null } },
}));

const supabase = {
  from: () => ({
    update: () => ({ eq: async () => updateResult.value }),
    select: () => ({ eq: () => ({ single: async () => ({ data: { slug: 'resto' } }) }) }),
  }),
};
vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserWithTenant: async () => ({ tenantId: 'tenant-1', supabase }),
}));

import { actionUpdatePaymentMethods } from '@/app/actions/payment-methods';

describe('actionUpdatePaymentMethods', () => {
  beforeEach(() => {
    updateResult.value = { error: null, count: 1 };
  });

  it('une ligne mise a jour: succes', async () => {
    expect(await actionUpdatePaymentMethods(['cash'])).toEqual({ success: true });
  });

  it('aucune ligne touchee (refus RLS silencieux): echec explicite, pas de faux succes', async () => {
    updateResult.value = { error: null, count: 0 };
    const res = await actionUpdatePaymentMethods(['cash']);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/role/);
  });
});
