// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import { CheckoutPaymentSection } from '../CheckoutPaymentSection';

const state: { current: unknown } = { current: { type: 'loading' } };
vi.mock('@stripe/react-stripe-js/checkout', () => ({
  useCheckout: () => state.current,
  PaymentElement: () => <div data-testid="payment-element" />,
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="fr-FR" messages={messages}>
    {children}
  </NextIntlClientProvider>
);

describe('CheckoutPaymentSection', () => {
  beforeEach(() => {
    state.current = { type: 'loading' };
  });

  it('propose la carte, et affiche le mobile money comme bientot disponible, non selectionnable', () => {
    render(<CheckoutPaymentSection />, { wrapper });
    expect(screen.getByRole('radio', { name: /Carte bancaire/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    for (const name of ['Orange Money', 'Moov Money', 'Wave', 'MTN MoMo']) {
      const option = screen.getByRole('radio', { name: new RegExp(name) });
      expect(option).toHaveAttribute('aria-disabled', 'true');
      expect(option).toHaveAttribute('aria-checked', 'false');
    }
    expect(screen.getAllByText('Bientôt disponible')).toHaveLength(4);
  });

  it("bloque le bouton tant que Stripe n'est pas pret", () => {
    render(<CheckoutPaymentSection />, { wrapper });
    expect(screen.getByRole('button', { name: "S'abonner" })).toBeDisabled();
  });

  it('affiche le refus de Stripe et rend la main', async () => {
    const confirm = vi.fn().mockResolvedValue({
      type: 'error',
      error: { message: 'Votre carte a été refusée.' },
    });
    state.current = { type: 'success', checkout: { canConfirm: true, confirm } };
    render(<CheckoutPaymentSection />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: "S'abonner" }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Votre carte a été refusée.'),
    );
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: "S'abonner" })).toBeEnabled();
  });
});
