// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { SubscriptionBanners } from '../SubscriptionBanners';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { getEffectiveLevels } from '@/lib/permissions';
import type { PermissionMap, Poste } from '@/types/permission.types';

// Fait 7 et X18: "Choisir mon plan", "Voir les plans" et "Mettre a jour" la
// carte etaient montres a toute l'equipe, alors que /subscription exige
// billing.manage (niveau borne compris, BILLING_READ) et que le portail de
// facturation exige billing.manage EN ENTIER. Le message reste visible pour
// tous; seul le bouton suit les permissions.

const sub = { isFrozen: false, isPastDue: false, isInTrial: true, daysRemaining: 2 };
vi.mock('@/contexts/SubscriptionContext', () => ({ useSubscription: () => sub }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/lib/billing/provider', () => ({
  billingCapabilities: () => ({ hostedPortal: true }),
}));

afterEach(() => {
  Object.assign(sub, { isFrozen: false, isPastDue: false });
});

function renderAs(poste: Poste, overrides: PermissionMap = {}) {
  const levels = getEffectiveLevels({ postes: [poste], permission_overrides: overrides });
  return render(
    <PermissionsProvider postes={[poste]} levels={levels}>
      <SubscriptionBanners tenantSlug="resto" />
    </PermissionsProvider>,
  );
}

describe('SubscriptionBanners - bouton d action selon les permissions', () => {
  it('essai: le proprietaire voit le choix du plan', () => {
    renderAs('owner');
    expect(screen.getByText('choosePlan')).toBeInTheDocument();
  });

  it('essai: le gerant (billing.manage borne) voit aussi le choix du plan', () => {
    renderAs('manager');
    expect(screen.getByText('choosePlan')).toBeInTheDocument();
  });

  it('essai: un serveur lit le compte a rebours sans lien vers les plans', () => {
    renderAs('waiter');
    expect(screen.getByText('daysRemaining')).toBeInTheDocument();
    expect(screen.queryByText('choosePlan')).toBeNull();
  });

  it('gel: un caissier ne voit pas "voir les plans"', () => {
    sub.isFrozen = true;
    renderAs('cashier');
    expect(screen.getByText('expired')).toBeInTheDocument();
    expect(screen.queryByText('seePlans')).toBeNull();
  });

  it('gel: le gerant voit "voir les plans"', () => {
    sub.isFrozen = true;
    renderAs('manager');
    expect(screen.getByText('seePlans')).toBeInTheDocument();
  });

  it('impaye: le bouton de carte est reserve a qui a billing.manage en entier (proprietaire)', () => {
    sub.isPastDue = true;
    renderAs('owner');
    expect(screen.getByRole('button', { name: /Mettre/ })).toBeInTheDocument();
  });

  it('impaye: le gerant lit le message mais ne voit pas le bouton de carte', () => {
    sub.isPastDue = true;
    renderAs('manager');
    expect(screen.queryByRole('button', { name: /Mettre/ })).toBeNull();
  });

  it('impaye: un gerant avec permission_overrides billing.manage voit le bouton', () => {
    sub.isPastDue = true;
    renderAs('manager', { 'billing.manage': true });
    expect(screen.getByRole('button', { name: /Mettre/ })).toBeInTheDocument();
  });
});
