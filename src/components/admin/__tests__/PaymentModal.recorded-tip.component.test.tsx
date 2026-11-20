// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import type { Order } from '@/types/admin.types';
import PaymentModal from '../PaymentModal';

/**
 * Audit pourboires du 2026-11-20 (constats A et B), au niveau de l'ecran.
 *
 * Le client a laisse 500 sur la vitrine. La caisse doit RECLAMER 5 500 (A) et
 * n'envoyer au serveur que ce qu'elle AJOUTE (B): le serveur additionne ce
 * montant au pourboire deja enregistre. Envoyer le total (500 + ajout)
 * compterait les 500 du client deux fois au registre.
 */

const submitOrder = vi.fn();
vi.mock('@/lib/offline/submit-order', () => ({
  submitOrder: (args: unknown) => submitOrder(args),
}));
vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscription: () => ({ canAccess: () => true }),
}));
vi.mock('@/components/admin/orders/CompOrderDialog', () => ({ default: () => null }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const order = {
  id: 'o1',
  tenant_id: 't1',
  total: 5000,
  subtotal: 5000,
  tip_amount: 500,
  display_currency: 'XOF',
} as unknown as Order;

function renderModal() {
  return render(
    <NextIntlClientProvider locale="fr-FR" messages={messages}>
      <PaymentModal order={order} currency="XOF" onClose={() => {}} onSuccess={() => {}} />
    </NextIntlClientProvider>,
  );
}

const sentTip = () =>
  (submitOrder.mock.calls[0][0] as { body: { tipMinor?: number } }).body.tipMinor;

describe('PaymentModal - pourboire deja laisse par le client', () => {
  beforeEach(() => {
    submitOrder.mockReset();
    submitOrder.mockResolvedValue({ status: 'sent', data: { paid: true } });
  });
  afterEach(cleanup);

  it('reclame commande + pourboire du client, et n envoie aucun ajout', async () => {
    renderModal();
    expect(screen.getAllByText(/5\D?500/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Pourboire laiss/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Montant exact/ }));
    fireEvent.click(screen.getByRole('button', { name: /Valider/ }));
    await waitFor(() => expect(submitOrder).toHaveBeenCalledTimes(1));
    expect(sentTip()).toBeUndefined();
  });

  it('avec 1 000 ajoutes a la caisse: reclame 6 500 et n envoie QUE les 1 000', async () => {
    renderModal();
    fireEvent.click(screen.getAllByRole('button', { name: /^1\D?000$/ })[0]);
    expect(screen.getAllByText(/6\D?500/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Montant exact/ }));
    fireEvent.click(screen.getByRole('button', { name: /Valider/ }));
    await waitFor(() => expect(submitOrder).toHaveBeenCalledTimes(1));
    expect(sentTip()).toBe(1000);
  });
});
