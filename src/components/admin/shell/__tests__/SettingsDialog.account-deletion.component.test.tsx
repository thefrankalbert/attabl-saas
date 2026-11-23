// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { DEFAULT_PERMISSIONS, type PermissionCode } from '@/types/permission.types';
import type { AdminRole } from '@/types/admin.types';
import { SettingsDialog } from '../SettingsDialog';

// Un restaurant gele est renvoye sur /subscription par le proxy: toute autre
// page admin, Parametres compris, est inaccessible. La suppression du compte
// doit donc vivre dans le volet "Mon compte" de ce dialogue, ouvert depuis
// n'importe quelle page du shell, /subscription comprise.

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/app/actions/account-deletion', () => ({
  actionDeleteOwnerAccount: vi.fn(),
  actionDeleteStaffAccount: vi.fn(),
}));

function renderAs(role: AdminRole) {
  const permissions = DEFAULT_PERMISSIONS[role] as Record<PermissionCode, boolean>;
  render(
    <PermissionsProvider role={role} permissions={permissions}>
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
      <PermissionsProvider
        role="owner"
        permissions={DEFAULT_PERMISSIONS.owner as Record<PermissionCode, boolean>}
      >
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
