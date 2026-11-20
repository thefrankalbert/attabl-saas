// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import { CurrentPlanPanel } from '../CurrentPlanPanel';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="fr-FR" messages={messages}>
    {children}
  </NextIntlClientProvider>
);

const base = {
  plan: 'pro' as const,
  status: 'trial',
  billingInterval: 'monthly' as const,
  hasSubscription: false,
  canOpenPortal: false,
  isBillingLoading: false,
  onManageBilling: () => {},
};

describe('CurrentPlanPanel - essai', () => {
  it("montre la date de fin et le nombre de jours restants pendant l'essai", () => {
    render(<CurrentPlanPanel {...base} periodEnd="2026-12-01T00:00:00Z" trialDaysLeft={5} />, {
      wrapper,
    });
    expect(
      screen.getByText('Votre essai gratuit se termine le 1 décembre 2026.'),
    ).toBeInTheDocument();
    expect(screen.getByText('5 jours restants')).toBeInTheDocument();
  });

  it('ne montre pas de jours restants hors essai', () => {
    render(<CurrentPlanPanel {...base} status="active" periodEnd="2026-12-01T00:00:00Z" />, {
      wrapper,
    });
    expect(screen.queryByText(/restants?$/)).not.toBeInTheDocument();
  });

  it('annonce le prochain paiement et explique le prorata pour un abonne', () => {
    render(
      <CurrentPlanPanel
        {...base}
        status="active"
        hasSubscription
        periodEnd="2026-12-01T00:00:00Z"
      />,
      { wrapper },
    );
    expect(
      screen.getByText(/^Prochain paiement : 79\s000 F\/mois, le 1 décembre 2026\.$/),
    ).toBeInTheDocument();
    expect(screen.getByText(messages.admin.subscription.prorataNote)).toBeInTheDocument();
  });
});
