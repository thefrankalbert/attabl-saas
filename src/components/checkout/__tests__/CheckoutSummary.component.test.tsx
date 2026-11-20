// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import { CheckoutSummary } from '../CheckoutSummary';

const checkoutState: { current: unknown } = { current: { type: 'loading' } };
vi.mock('@stripe/react-stripe-js/checkout', () => ({
  useCheckout: () => checkoutState.current,
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="fr-FR" messages={messages}>
    {children}
  </NextIntlClientProvider>
);

function session(dueToday: number, trialEnd: number | null) {
  return {
    type: 'success',
    checkout: {
      minorUnitsAmountDivisor: 1,
      total: { total: { minorUnitsAmount: dueToday, amount: `${dueToday} FCFA` } },
      recurring: trialEnd ? { trial: { trialEnd, trialPeriodDays: 9 } } : { trial: null },
    },
  };
}

describe('CheckoutSummary', () => {
  beforeEach(() => {
    checkoutState.current = { type: 'loading' };
  });

  it("affiche le total annuel reellement facture, pas l'equivalent mensuel", () => {
    checkoutState.current = session(804000, null);
    render(<CheckoutSummary plan="pro" interval="yearly" />, { wrapper });
    expect(screen.getAllByText(/^804\s000 F$/).length).toBe(2);
    expect(screen.getByText('Facturé chaque année')).toBeInTheDocument();
    expect(screen.queryByText(/67\s000/)).not.toBeInTheDocument();
  });

  it("pendant l'essai, le montant du jour vient de Stripe (0 F) et la date de reprise est dite", () => {
    // 1er decembre 2026, midi UTC.
    checkoutState.current = session(0, Date.UTC(2026, 11, 1, 12) / 1000);
    render(<CheckoutSummary plan="starter" interval="monthly" />, { wrapper });
    expect(screen.getByText(/^0 F$/)).toBeInTheDocument();
    expect(
      screen.getByText("Votre essai gratuit continue jusqu'au 1 décembre 2026."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^Puis 39\s000 F par mois, à partir du 1 décembre 2026\.$/),
    ).toBeInTheDocument();
  });

  it("n'invente pas de montant du jour tant que Stripe n'a pas repondu", () => {
    render(<CheckoutSummary plan="business" interval="monthly" />, { wrapper });
    expect(screen.getAllByText(/F$/).length).toBe(1);
    expect(screen.getByText('Tout Pro, plus :')).toBeInTheDocument();
  });
});
