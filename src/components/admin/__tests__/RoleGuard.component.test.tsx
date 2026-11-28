// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import RoleGuard from '../RoleGuard';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { getEffectiveLevels } from '@/lib/permissions';
import type { Poste } from '@/types/permission.types';

// --- Mocks ----------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Les niveaux viennent de la vraie resolution (getEffectiveLevels), jamais
// d'une carte ecrite a la main.
function renderAs(poste: Poste, ui: React.ReactNode) {
  return render(
    <PermissionsProvider postes={[poste]} levels={getEffectiveLevels({ postes: [poste] })}>
      {ui}
    </PermissionsProvider>,
  );
}

// --- Tests ----------------------------------------------

describe('RoleGuard', () => {
  it('renders children when user has required permission', () => {
    renderAs(
      'chef',
      <RoleGuard permission="menu.edit">
        <div data-testid="protected">Protected content</div>
      </RoleGuard>,
    );

    expect(screen.getByTestId('protected')).toBeInTheDocument();
  });

  it('shows AccessDenied when permission check fails (temoin: meme garde, autre poste)', () => {
    renderAs(
      'waiter',
      <RoleGuard permission="menu.edit">
        <div data-testid="protected">Protected content</div>
      </RoleGuard>,
    );

    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
    expect(screen.getByText('accessDenied')).toBeInTheDocument();
    // Message generique: l'ancien texte parlait des permissions sur des pages
    // qui n'avaient rien a voir.
    expect(screen.getByText('noAccessHint')).toBeInTheDocument();
    expect(screen.queryByText('ownerOnly')).not.toBeInTheDocument();
  });

  it('un droit borne (limited) ne passe pas la garde: seul full ouvre', () => {
    renderAs(
      'waiter',
      <RoleGuard permission="orders.pay">
        <div data-testid="protected">Protected content</div>
      </RoleGuard>,
    );

    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
  });

  it('une exigence en tableau demande TOUS les droits', () => {
    renderAs(
      'cashier',
      <RoleGuard permission={['orders.pay', 'orders.refund']}>
        <div data-testid="protected">Protected content</div>
      </RoleGuard>,
    );

    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
  });

  it('ownerOnly: le proprietaire passe', () => {
    renderAs(
      'owner',
      <RoleGuard ownerOnly>
        <div data-testid="protected">Protected content</div>
      </RoleGuard>,
    );

    expect(screen.getByTestId('protected')).toBeInTheDocument();
  });

  it('ownerOnly: le gerant, qui a pourtant tous les droits, ne passe pas', () => {
    renderAs(
      'manager',
      <RoleGuard ownerOnly>
        <div data-testid="protected">Protected content</div>
      </RoleGuard>,
    );

    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
    expect(screen.getByText('accessDenied')).toBeInTheDocument();
  });

  it('renders custom fallback when access denied', () => {
    renderAs(
      'manager',
      <RoleGuard ownerOnly fallback={<div data-testid="custom-fallback">No access</div>}>
        <div data-testid="protected">Protected content</div>
      </RoleGuard>,
    );

    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
  });

  it('renders children when no permission or ownerOnly specified', () => {
    renderAs(
      'waiter',
      <RoleGuard>
        <div data-testid="protected">Open content</div>
      </RoleGuard>,
    );

    expect(screen.getByTestId('protected')).toBeInTheDocument();
  });
});
