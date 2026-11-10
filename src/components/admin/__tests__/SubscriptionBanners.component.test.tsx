// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { SubscriptionBanners } from '../SubscriptionBanners';

// Fait 7 et X18: "Choisir mon plan", "Voir les plans" et "Mettre a jour" la
// carte etaient montres a toute l'equipe, alors que /subscription exige
// settings.view et que le portail de facturation n'accepte qu'owner et admin.
// Le message reste visible pour tous; seul le bouton suit les permissions.

const sub = { isFrozen: false, isPastDue: false, isInTrial: true, daysRemaining: 2 };
vi.mock('@/contexts/SubscriptionContext', () => ({ useSubscription: () => sub }));

const actor: { role: string; perms: Record<string, boolean> } = {
  role: 'owner',
  perms: { 'settings.view': true },
};
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    role: actor.role,
    permissions: actor.perms,
    can: (c: string) => actor.perms[c] === true,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/lib/billing/provider', () => ({
  billingCapabilities: () => ({ hostedPortal: true }),
}));

afterEach(() => {
  actor.role = 'owner';
  actor.perms = { 'settings.view': true };
  Object.assign(sub, { isFrozen: false, isPastDue: false });
});

describe('SubscriptionBanners - bouton d action selon les permissions', () => {
  it('essai: le proprietaire voit le choix du plan', () => {
    render(<SubscriptionBanners tenantSlug="resto" />);
    expect(screen.getByText('choosePlan')).toBeInTheDocument();
  });

  it('essai: un serveur lit le compte a rebours sans lien vers les plans', () => {
    actor.role = 'waiter';
    actor.perms = { 'settings.view': false };
    render(<SubscriptionBanners tenantSlug="resto" />);
    expect(screen.getByText('daysRemaining')).toBeInTheDocument();
    expect(screen.queryByText('choosePlan')).toBeNull();
  });

  it('gel: un caissier ne voit pas "voir les plans"', () => {
    sub.isFrozen = true;
    actor.role = 'cashier';
    actor.perms = { 'settings.view': false };
    render(<SubscriptionBanners tenantSlug="resto" />);
    expect(screen.getByText('expired')).toBeInTheDocument();
    expect(screen.queryByText('seePlans')).toBeNull();
  });

  it('impaye: le bouton de carte est reserve a owner et admin', () => {
    sub.isPastDue = true;
    render(<SubscriptionBanners tenantSlug="resto" />);
    expect(screen.getByRole('button', { name: /Mettre/ })).toBeInTheDocument();
  });

  it('impaye: un gerant a qui on a donne settings.view ne voit pas le bouton', () => {
    sub.isPastDue = true;
    actor.role = 'manager';
    render(<SubscriptionBanners tenantSlug="resto" />);
    expect(screen.queryByRole('button', { name: /Mettre/ })).toBeNull();
  });
});
