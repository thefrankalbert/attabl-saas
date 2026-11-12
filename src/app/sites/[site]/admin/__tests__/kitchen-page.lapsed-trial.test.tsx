import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { isValidElement, type ReactElement } from 'react';

// Fin d'essai sans abonnement (decision produit du 2026-11-09): la cuisine
// finit les commandes passees avant `trial_ends_at`. Or a la fin de l'essai le
// plan effectif retombe sur le plan stocke (souvent `starter`, sans cuisine):
// sans exception, la page afficherait le mur "passez au plan superieur" et les
// commandes resteraient en plan. Ce test fige l'exception ET ses limites.

const state = vi.hoisted(() => ({
  tenant: {} as Record<string, unknown>,
  billing: vi.fn(),
}));

vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/cache', () => ({ getTenant: async () => state.tenant }));
vi.mock('@/lib/billing/tenant-billing-ids', () => ({
  getTenantBillingIds: (id: string) => state.billing(id),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/components/admin/KitchenClient', () => ({ default: () => null }));
vi.mock('@/components/admin/TenantNotFound', () => ({ default: () => null }));
vi.mock('@/components/admin/FeatureUpgradeWall', () => ({ FeatureUpgradeWall: () => null }));

const HEURE = 3_600_000;
const ilYa = (ms: number) => new Date(Date.now() - ms).toISOString();

async function rendu(tenant: Record<string, unknown>): Promise<string> {
  state.tenant = {
    id: 't1',
    name: 'Chez Awa',
    subscription_plan: 'starter',
    is_active: true,
    suspended_at: null,
    ...tenant,
  };
  const { default: KitchenPage } = await import('../kitchen/page');
  const el = (await KitchenPage({ params: Promise.resolve({ site: 'resto' }) })) as ReactElement;
  const { default: KitchenClient } = await import('@/components/admin/KitchenClient');
  // La page rend un fragment (titre h1 masque + cuisine): on cherche la cuisine dedans.
  const enfants = React.Children.toArray((el.props as { children?: React.ReactNode }).children);
  const ouverte =
    el.type === KitchenClient || enfants.some((c) => isValidElement(c) && c.type === KitchenClient);
  return ouverte ? 'cuisine' : 'mur';
}

describe('Page cuisine - fin d essai', () => {
  beforeEach(() => {
    state.billing.mockReset();
    state.billing.mockResolvedValue({ stripe_subscription_id: null });
  });

  it('essai expire pas encore gele, plan starter: la cuisine reste ouverte', async () => {
    await expect(
      rendu({ subscription_status: 'trial', trial_ends_at: ilYa(2 * HEURE) }),
    ).resolves.toBe('cuisine');
  });

  it('essai expire mais suspendu par le super-admin: mur', async () => {
    await expect(
      rendu({
        subscription_status: 'trial',
        trial_ends_at: ilYa(2 * HEURE),
        suspended_at: ilYa(HEURE),
      }),
    ).resolves.toBe('mur');
  });

  it('essai gele par le cron: mur', async () => {
    await expect(
      rendu({
        is_active: false,
        subscription_status: 'frozen',
        trial_ends_at: ilYa(13 * HEURE),
      }),
    ).resolves.toBe('mur');
  });

  it('abonne au plan starter (sans cuisine): mur, comme avant', async () => {
    await expect(
      rendu({ subscription_status: 'active', trial_ends_at: ilYa(30 * 24 * HEURE) }),
    ).resolves.toBe('mur');
    expect(state.billing).not.toHaveBeenCalled();
  });

  it('essai en cours: cuisine ouverte par le plan d essai', async () => {
    await expect(
      rendu({
        subscription_status: 'trial',
        trial_ends_at: new Date(Date.now() + HEURE).toISOString(),
      }),
    ).resolves.toBe('cuisine');
  });
});
