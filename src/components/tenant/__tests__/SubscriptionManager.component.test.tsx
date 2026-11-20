// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import { SubscriptionManager } from '../SubscriptionManager';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="fr-FR" messages={messages}>
    {children}
  </NextIntlClientProvider>
);

const baseTenant = {
  id: 't1',
  subscription_current_period_end: '2026-12-01T00:00:00Z',
  billing_interval: 'monthly',
};

describe('SubscriptionManager - choix de formule', () => {
  it('recommande Pro a un restaurant en essai Starter et le laisse payer Starter', () => {
    render(
      <SubscriptionManager
        tenant={{
          ...baseTenant,
          subscription_plan: 'starter',
          subscription_status: 'trial',
          trial_ends_at: '2026-12-01T00:00:00Z',
        }}
        siteSlug="demo"
      />,
      { wrapper },
    );
    expect(screen.getByText('Le plus populaire')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "S'abonner à Starter" })).toBeEnabled();
    expect(screen.getByText('Tout Starter, plus :')).toBeInTheDocument();
    expect(screen.getByText('Tout Pro, plus :')).toBeInTheDocument();
  });

  it('ne recommande pas Pro, formule inferieure, a un client Business', () => {
    render(
      <SubscriptionManager
        tenant={{ ...baseTenant, subscription_plan: 'business', subscription_status: 'active' }}
        siteSlug="demo"
      />,
      { wrapper },
    );
    expect(screen.queryByText('Le plus populaire')).not.toBeInTheDocument();
  });

  it('ne pousse jamais un client Pro abonne vers une autre formule', () => {
    render(
      <SubscriptionManager
        tenant={{
          ...baseTenant,
          subscription_plan: 'pro',
          subscription_status: 'active',
          stripe_subscription_id: 'sub_123',
        }}
        siteSlug="demo"
      />,
      { wrapper },
    );
    expect(screen.queryByText('Le plus populaire')).not.toBeInTheDocument();
    // Abonne Stripe: sa formule actuelle reste verrouillee.
    expect(screen.getByRole('button', { name: 'Votre formule actuelle' })).toBeDisabled();
  });
});
