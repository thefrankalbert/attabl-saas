// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import type { Order } from '@/types/admin.types';
import { PaymentMethodsProvider } from '@/contexts/PaymentMethodsContext';
import PaymentModal from '../PaymentModal';

const submitOrder = vi.fn();
vi.mock('@/lib/offline/submit-order', () => ({
  submitOrder: (args: unknown) => submitOrder(args),
}));
vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscription: () => ({ canAccess: () => false }),
}));
vi.mock('@/components/admin/orders/CompOrderDialog', () => ({ default: () => null }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const order = {
  id: 'o1',
  tenant_id: 't1',
  total: 7500,
  display_currency: 'XAF',
} as unknown as Order;

function tree(methods: readonly string[] | null, onSuccess = vi.fn()) {
  return (
    <NextIntlClientProvider locale="fr-FR" messages={messages}>
      <PaymentMethodsProvider methods={methods}>
        <PaymentModal order={order} currency="XAF" onClose={() => {}} onSuccess={onSuccess} />
      </PaymentMethodsProvider>
    </NextIntlClientProvider>
  );
}

function renderModal(methods: readonly string[] | null = null) {
  return render(tree(methods));
}

const sentMethod = () => (submitOrder.mock.calls[0][0] as { body: { method: string } }).body.method;

describe('PaymentModal - moyen de paiement', () => {
  beforeEach(() => {
    submitOrder.mockReset();
    submitOrder.mockResolvedValue({ status: 'sent', data: { paid: true } });
  });
  afterEach(cleanup);

  it('envoie "card" quand le caissier choisit Carte (terminal), sans saisie de montant', async () => {
    renderModal();
    fireEvent.click(await screen.findByRole('radio', { name: 'Carte (terminal)' }));
    const validate = screen.getByRole('button', { name: /Valider/ });
    expect(validate).toBeEnabled();
    fireEvent.click(validate);
    await waitFor(() => expect(submitOrder).toHaveBeenCalledTimes(1));
    expect(sentMethod()).toBe('card');
  });

  // Temoin negatif: sans toucher au selecteur, le moyen reste especes, et la
  // validation exige toujours le montant recu.
  it('par defaut: especes, validation bloquee tant que le montant recu manque', async () => {
    renderModal();
    const validate = await screen.findByRole('button', { name: /Valider/ });
    expect(screen.getByRole('radio', { name: 'Carte (terminal)' })).toHaveAttribute(
      'data-state',
      'off',
    );
    expect(validate).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Montant exact/ }));
    expect(validate).toBeEnabled();
    fireEvent.click(validate);
    await waitFor(() => expect(submitOrder).toHaveBeenCalledTimes(1));
    expect(sentMethod()).toBe('cash');
  });

  // Reglage du restaurant: especes seules -> pas de selecteur, "cash" envoye.
  it('restaurant en especes seules: selecteur absent et cash envoye', async () => {
    renderModal(['cash']);
    const validate = await screen.findByRole('button', { name: /Valider/ });
    expect(screen.queryByRole('radio', { name: 'Carte (terminal)' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Montant exact/ }));
    fireEvent.click(validate);
    await waitFor(() => expect(submitOrder).toHaveBeenCalledTimes(1));
    expect(sentMethod()).toBe('cash');
  });

  it('restaurant en carte seule: carte par defaut, pave numerique masque', async () => {
    renderModal(['card']);
    const validate = await screen.findByRole('button', { name: /Valider/ });
    expect(screen.queryByRole('button', { name: /Montant exact/ })).toBeNull();
    expect(validate).toBeEnabled();
    fireEvent.click(validate);
    await waitFor(() => expect(submitOrder).toHaveBeenCalledTimes(1));
    expect(sentMethod()).toBe('card');
  });

  it('un reglage qui arrive apres le montage ecarte la carte deja choisie', async () => {
    const { rerender } = renderModal(null);
    fireEvent.click(await screen.findByRole('radio', { name: 'Carte (terminal)' }));
    expect(screen.queryByRole('button', { name: /Montant exact/ })).toBeNull();
    rerender(tree(['cash']));
    // La carte n'est plus proposee: retour aux especes, pave de nouveau affiche.
    expect(await screen.findByRole('button', { name: /Montant exact/ })).toBeInTheDocument();
    const validate = screen.getByRole('button', { name: /Valider/ });
    expect(validate).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Montant exact/ }));
    fireEvent.click(validate);
    await waitFor(() => expect(submitOrder).toHaveBeenCalledTimes(1));
    expect(sentMethod()).toBe('cash');
  });
});
