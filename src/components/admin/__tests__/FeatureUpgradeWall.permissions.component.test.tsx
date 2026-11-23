// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';

// X18: le mur "fonction Pro" (12 pages) envoyait tout le monde vers
// /subscription, que le personnel ne peut pas ouvrir (settings.view). Le
// bouton ne s'affiche plus qu'a qui peut choisir un plan; les autres lisent
// qui peut activer la fonction.

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: vi.fn(async () => ({ data: null, error: null })) }),
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const mockGetPermission = vi.fn();
vi.mock('@/lib/auth/require-admin-permission', () => ({
  getAdminPermission: (...a: unknown[]) => mockGetPermission(...a),
}));

import { FeatureUpgradeWall } from '../FeatureUpgradeWall';

beforeEach(() => vi.clearAllMocks());

async function renderWall() {
  render(
    await FeatureUpgradeWall({
      feature: 'reports',
      checkoutUrl: '/sites/resto/admin/subscription',
    }),
  );
}

describe('FeatureUpgradeWall - bouton selon settings.view', () => {
  it('proprietaire: le bouton de passage au Pro', async () => {
    mockGetPermission.mockResolvedValue(true);
    await renderWall();
    expect(screen.getByText('upgradeCta')).toBeInTheDocument();
    expect(mockGetPermission).toHaveBeenCalledWith('resto', 'settings.view');
  });

  it('personnel: pas de bouton, le nom de qui peut activer', async () => {
    mockGetPermission.mockResolvedValue(false);
    await renderWall();
    expect(screen.queryByText('upgradeCta')).toBeNull();
    expect(screen.getByText('askOwner')).toBeInTheDocument();
  });
});

// Ecran cuisine: page plein ecran sans menu. Sans lien de retour, le mur etait
// une impasse (constat visuel du 2026-11-21, 375 et 1280 px).
describe('FeatureUpgradeWall - lien de retour', () => {
  it('affiche le retour au tableau de bord quand backHref est donne', async () => {
    mockGetPermission.mockResolvedValue(true);
    render(
      await FeatureUpgradeWall({
        feature: 'kds',
        checkoutUrl: '/sites/resto/admin/subscription',
        backHref: '/sites/resto/admin',
      }),
    );
    expect(screen.getByText('back').closest('a')).toHaveAttribute('href', '/sites/resto/admin');
  });

  it('pas de lien de retour par defaut (pages dans le menu)', async () => {
    mockGetPermission.mockResolvedValue(true);
    await renderWall();
    expect(screen.queryByText('back')).toBeNull();
  });
});
