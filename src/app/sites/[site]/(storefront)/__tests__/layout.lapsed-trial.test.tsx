import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isValidElement } from 'react';

import { StorefrontUnavailable } from '@/components/tenant/StorefrontUnavailable';

// Entre `trial_ends_at` et le cron de 02:00, la commande est refusee en 403
// (validateTenant -> tenantLockReason). La vitrine doit le dire tout de suite
// au lieu de montrer une carte dont l'envoi echouera.

const state = vi.hoisted(() => ({
  tenant: {} as Record<string, unknown>,
  billing: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/cache', () => ({
  getCachedTenant: async () => state.tenant,
  toPublicTenant: (t: unknown) => t,
}));
vi.mock('@/lib/billing/tenant-billing-ids', () => ({
  getTenantBillingIds: (id: string) => state.billing(id),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const HIER = new Date(Date.now() - 86_400_000).toISOString();
const DEMAIN = new Date(Date.now() + 86_400_000).toISOString();

async function render(tenant: Record<string, unknown>) {
  state.tenant = { id: 't1', slug: 'resto', is_active: true, suspended_at: null, ...tenant };
  const { default: StorefrontLayout } = await import('../layout');
  return StorefrontLayout({ children: null, params: Promise.resolve({ site: 'resto' }) });
}

function isUnavailable(tree: unknown): boolean {
  return isValidElement(tree) && tree.type === StorefrontUnavailable;
}

describe('StorefrontLayout - essai expire', () => {
  beforeEach(() => state.billing.mockReset());

  it('essai expire sans abonnement Stripe: vitrine indisponible', async () => {
    state.billing.mockResolvedValue({ stripe_subscription_id: null });
    expect(isUnavailable(await render({ subscription_status: 'trial', trial_ends_at: HIER }))).toBe(
      true,
    );
    expect(state.billing).toHaveBeenCalledWith('t1');
  });

  it('essai expire mais abonnement Stripe ouvert: carte servie', async () => {
    state.billing.mockResolvedValue({ stripe_subscription_id: 'sub_123' });
    expect(isUnavailable(await render({ subscription_status: 'trial', trial_ends_at: HIER }))).toBe(
      false,
    );
  });

  it('essai en cours: carte servie, sans lecture service_role', async () => {
    expect(
      isUnavailable(await render({ subscription_status: 'trial', trial_ends_at: DEMAIN })),
    ).toBe(false);
    expect(state.billing).not.toHaveBeenCalled();
  });
});
