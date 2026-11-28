// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { getEffectiveLevels } from '@/lib/permissions';
import type { Poste } from '@/types/permission.types';
import { SettingsDialog } from '../SettingsDialog';

// Un restaurant gele est renvoye sur /subscription par le proxy: toute autre
// page admin, Parametres compris, est inaccessible. La suppression du compte
// doit donc vivre dans le volet "Mon compte" de ce dialogue, ouvert depuis
// n'importe quelle page du shell, /subscription comprise.

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
// Volet double authentification: teste a part (actions et service mfa).
vi.mock('@/components/shared/mfa/MfaSettingsSection', () => ({
  MfaSettingsSection: () => null,
}));
vi.mock('@/app/actions/account-deletion', () => ({
  actionDeleteOwnerAccount: vi.fn(),
  actionDeleteStaffAccount: vi.fn(),
}));

function renderAs(poste: Poste) {
  render(
    <PermissionsProvider postes={[poste]} levels={getEffectiveLevels({ postes: [poste] })}>
      <SettingsDialog
        open
        onOpenChange={() => undefined}
        activeTab="compte"
        onTabChange={() => undefined}
        basePath="/sites/demo/admin"
        userName="Awa"
        userEmail="awa@example.com"
        tenant={{ name: 'Chez Awa', slug: 'demo', subscription_plan: 'pro' }}
      />
    </PermissionsProvider>,
  );
}

describe('SettingsDialog: suppression du compte dans "Mon compte"', () => {
  it('le proprietaire y ferme son restaurant, sans passer par Parametres', () => {
    renderAs('owner');
    expect(screen.getByText('owner_title')).toBeInTheDocument();
    expect(screen.queryByText('staff_title')).toBeNull();
  });

  it('le gerant n est pas proprietaire: il supprime son compte, il ne ferme pas le restaurant', () => {
    renderAs('manager');
    expect(screen.getByText('staff_title')).toBeInTheDocument();
    expect(screen.queryByText('owner_title')).toBeNull();
  });

  it('le personnel y supprime son compte', () => {
    renderAs('waiter');
    expect(screen.getByText('staff_title')).toBeInTheDocument();
    expect(screen.queryByText('owner_title')).toBeNull();
  });
});

// Contre-audit des offres (2026-11-20): il n'existe AUCUN plan gratuit. Sans
// plan enregistre, le restaurant est Starter, comme le dit getEffectivePlan.
describe('SettingsDialog: libelle du plan', () => {
  it('affiche STARTER, jamais GRATUIT, quand aucun plan n est enregistre', () => {
    render(
      <PermissionsProvider postes={['owner']} levels={getEffectiveLevels({ postes: ['owner'] })}>
        <SettingsDialog
          open
          onOpenChange={() => undefined}
          activeTab="compte"
          onTabChange={() => undefined}
          basePath="/sites/demo/admin"
          userName="Awa"
          userEmail="awa@example.com"
          tenant={{ name: 'Chez Awa', slug: 'demo' }}
        />
      </PermissionsProvider>,
    );
    expect(screen.getByDisplayValue('STARTER')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('GRATUIT')).toBeNull();
  });
});
