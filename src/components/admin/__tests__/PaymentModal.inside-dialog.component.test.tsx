// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import type { Order } from '@/types/admin.types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import PaymentModal from '../PaymentModal';

/**
 * Mesure du 2026-11-21 sur un build de production local: ouvert depuis le
 * detail d'une commande (fenetre Radix modale), l'ecran d'encaissement
 * ignorait TOUS les clics. Radix pose `pointer-events: none` sur <body>, et le
 * portail maison de l'ecran (hors du contenu Radix) en heritait; le piege a
 * focus et la touche Echap restaient aussi a la fenetre du dessous.
 *
 * Ces tests passent par user-event, qui REFUSE de cliquer un element qui a ou
 * herite de `pointer-events: none`: ils echouent sur l'ancien code.
 */

vi.mock('@/lib/offline/submit-order', () => ({ submitOrder: vi.fn() }));
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

function renderInsideDetails(onClosePayment = vi.fn(), onCloseDetails = vi.fn()) {
  render(
    <NextIntlClientProvider locale="fr-FR" messages={messages}>
      <Dialog open onOpenChange={(open) => !open && onCloseDetails()}>
        <DialogContent>
          <DialogTitle>Detail</DialogTitle>
          <PaymentModal
            order={order}
            currency="XOF"
            onClose={onClosePayment}
            onSuccess={() => {}}
          />
        </DialogContent>
      </Dialog>
    </NextIntlClientProvider>,
  );
  return { onClosePayment, onCloseDetails };
}

describe('PaymentModal ouvert depuis une fenetre Radix (detail de commande)', () => {
  afterEach(cleanup);

  it('reste cliquable: le pourboire de la caisse s ajoute au montant', async () => {
    const user = userEvent.setup();
    renderInsideDetails();
    await user.click(screen.getAllByRole('button', { name: /^1\D?000$/ })[0]);
    expect(screen.getAllByText(/6\D?500/).length).toBeGreaterThan(0);
  });

  it('accepte la saisie d un pourboire personnalise', async () => {
    const user = userEvent.setup();
    renderInsideDetails();
    await user.click(screen.getAllByRole('button', { name: 'Personnalisé' })[0]);
    const field = screen.getAllByRole('spinbutton', { name: 'Personnalisé' })[0];
    await user.type(field, '750');
    expect(field).toHaveValue(750);
    expect(screen.getAllByText(/6\D?250/).length).toBeGreaterThan(0);
  });

  it('Echap ferme l encaissement, pas le detail de la commande', async () => {
    const user = userEvent.setup();
    const { onClosePayment, onCloseDetails } = renderInsideDetails();
    await user.keyboard('{Escape}');
    expect(onClosePayment).toHaveBeenCalledTimes(1);
    expect(onCloseDetails).not.toHaveBeenCalled();
  });
});
