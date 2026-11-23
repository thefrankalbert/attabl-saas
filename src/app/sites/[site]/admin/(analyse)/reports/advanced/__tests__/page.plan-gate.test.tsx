import { describe, it, expect, vi } from 'vitest';
import React, { isValidElement, type ReactElement } from 'react';

// Rapports avances: Business et Enterprise (l'essai actif compte comme
// Business). La page rend le mur pour Starter et Pro, l'ecran sinon. Temoin:
// le meme rendu avec un plan Business ouvre bien l'ecran.

const state = vi.hoisted(() => ({ tenant: {} as Record<string, unknown> }));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/cache', () => ({ getTenant: async () => state.tenant }));
vi.mock('@/lib/auth/require-admin-permission', () => ({ requireAdminPermission: vi.fn() }));
vi.mock('@/components/admin/reports/advanced/AdvancedReportsClient', () => ({
  default: () => null,
}));
vi.mock('@/components/admin/TenantNotFound', () => ({ default: () => null }));
vi.mock('@/components/admin/FeatureUpgradeWall', () => ({ FeatureUpgradeWall: () => null }));

async function rendu(tenant: Record<string, unknown>): Promise<'ecran' | 'mur'> {
  state.tenant = { id: 't1', currency: 'XOF', trial_ends_at: null, ...tenant };
  const { default: Page } = await import('../page');
  const el = (await Page({ params: Promise.resolve({ site: 'resto' }) })) as ReactElement;
  const { default: Client } =
    await import('@/components/admin/reports/advanced/AdvancedReportsClient');
  const enfants = React.Children.toArray((el.props as { children?: React.ReactNode }).children);
  return enfants.some((c) => isValidElement(c) && c.type === Client) ? 'ecran' : 'mur';
}

describe('Page rapports avances - verrou de plan', () => {
  it('Starter: mur', async () => {
    await expect(
      rendu({ subscription_plan: 'starter', subscription_status: 'active' }),
    ).resolves.toBe('mur');
  });

  it('Pro: mur', async () => {
    await expect(rendu({ subscription_plan: 'pro', subscription_status: 'active' })).resolves.toBe(
      'mur',
    );
  });

  it('temoin Business: ecran', async () => {
    await expect(
      rendu({ subscription_plan: 'business', subscription_status: 'active' }),
    ).resolves.toBe('ecran');
  });

  it('Enterprise: ecran', async () => {
    await expect(
      rendu({ subscription_plan: 'enterprise', subscription_status: 'active' }),
    ).resolves.toBe('ecran');
  });

  it('essai actif, plan enregistre Pro: ecran (l essai donne Business)', async () => {
    const future = new Date(Date.now() + 5 * 864e5).toISOString();
    await expect(
      rendu({ subscription_plan: 'pro', subscription_status: 'trial', trial_ends_at: future }),
    ).resolves.toBe('ecran');
  });

  it('Business gele: mur', async () => {
    await expect(
      rendu({ subscription_plan: 'business', subscription_status: 'frozen' }),
    ).resolves.toBe('mur');
  });
});
